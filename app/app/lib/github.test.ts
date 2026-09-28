import { describe, expect, it, vi } from "vitest";
import { parseRepoUrl, parsePrUrl, openScaffoldPr, checksForPr, resolveGithub, GithubError } from "./github";

// The write path a scaffold takes, against a fake GitHub that records every call in order.
//
// What these guard is the failure that looks like success: a scaffold that half-applied. A branch
// with no commit, or a commit with no PR, reads as "done" to anyone who only sees the last call
// succeed — so the sequence, and what each call carries, is asserted rather than assumed.

const creds = { token: "t0ken" };

type Reply = { status?: number; body?: unknown };
/** Routes are `METHOD path`; a value is one reply or a list consumed in order. */
function fakeGithub(routes: Record<string, Reply | Reply[]>) {
  const calls: { method: string; path: string; body: unknown; auth: string | null }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url).replace("https://api.github.com", "");
    const method = init?.method ?? "GET";
    calls.push({
      method, path: u, body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: (init?.headers as Record<string, string>)?.Authorization ?? null,
    });
    const hit = routes[`${method} ${u}`];
    const reply = Array.isArray(hit) ? hit.shift() : hit;
    if (!reply) return new Response(JSON.stringify({ message: `no route ${method} ${u}` }), { status: 500 });
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
  });
  return { calls, fetch: impl as unknown as typeof fetch };
}

const HAPPY = (over: Record<string, Reply | Reply[]> = {}) => ({
  "GET /repos/o/r": { body: { default_branch: "main" } },
  "GET /repos/o/r/git/ref/heads/main": { body: { object: { sha: "base1" } } },
  "GET /repos/o/r/git/commits/base1": { body: { tree: { sha: "tree0" } } },
  "POST /repos/o/r/git/trees": { body: { sha: "tree1" } },
  "POST /repos/o/r/git/commits": { body: { sha: "commit1" } },
  "POST /repos/o/r/git/refs": { status: 201, body: {} },
  "POST /repos/o/r/pulls": { status: 201, body: { html_url: "https://github.com/o/r/pull/7", number: 7, head: { sha: "commit1" } } },
  ...over,
});
const ARGS = {
  owner: "o", repo: "r", branch: "chore/scaffold-api", title: "Scaffold api", body: "b", message: "m",
  files: [{ path: "compass/config.yaml", content: "checks:\n  - npm test\n" }, { path: "README.md", content: "hi" }],
};

describe("parsing", () => {
  it("reads the owner and repo from every URL shape a repo row might hold", () => {
    for (const u of ["https://github.com/o/r", "https://github.com/o/r.git", "https://github.com/o/r/", "git@github.com:o/r.git"])
      expect(parseRepoUrl(u), u).toEqual({ owner: "o", repo: "r" });
  });
  it("refuses a URL that is not GitHub, rather than guessing", () => {
    expect(parseRepoUrl("https://gitlab.com/o/r")).toBeNull();
    expect(parseRepoUrl("")).toBeNull();
    expect(parseRepoUrl(null)).toBeNull();
  });
  it("reads a pull request URL", () => {
    expect(parsePrUrl("https://github.com/o/r/pull/12")).toEqual({ owner: "o", repo: "r", number: 12 });
    expect(parsePrUrl("https://github.com/o/r/tree/main")).toBeNull();
  });
});

describe("the token", () => {
  it("prefers the engagement's, and falls back to the server's", () => {
    vi.stubEnv("GITHUB_TOKEN", "from-env");
    expect(resolveGithub({ github_token: "plain-token" })?.token).toBe("plain-token");
    expect(resolveGithub({ github_token: null })?.token).toBe("from-env");
    vi.stubEnv("GITHUB_TOKEN", "");
    expect(resolveGithub({ github_token: null })).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe("opening a scaffold pull request", () => {
  it("commits every file as ONE commit off the default branch, then opens the PR against it", async () => {
    const gh = fakeGithub(HAPPY());
    const pr = await openScaffoldPr(creds, ARGS, gh.fetch);

    expect(gh.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /repos/o/r", "GET /repos/o/r/git/ref/heads/main", "GET /repos/o/r/git/commits/base1",
      "POST /repos/o/r/git/trees", "POST /repos/o/r/git/commits", "POST /repos/o/r/git/refs", "POST /repos/o/r/pulls",
    ]);
    const tree = gh.calls.find((c) => c.path.endsWith("/git/trees"))!.body as { base_tree: string; tree: { path: string; content: string }[] };
    expect(tree.base_tree).toBe("tree0");
    expect(tree.tree.map((t) => t.path)).toEqual(["compass/config.yaml", "README.md"]);
    expect(tree.tree[0].content).toContain("checks:");
    const commit = gh.calls.find((c) => c.path.endsWith("/git/commits"))!.body as { parents: string[]; tree: string };
    expect(commit).toMatchObject({ parents: ["base1"], tree: "tree1" });
    expect(gh.calls.find((c) => c.path.endsWith("/pulls"))!.body).toMatchObject({ head: "chore/scaffold-api", base: "main" });
    expect(pr).toEqual({ url: "https://github.com/o/r/pull/7", number: 7, branch: "chore/scaffold-api", headSha: "commit1", base: "main" });
  });

  it("authenticates every call with the token", async () => {
    const gh = fakeGithub(HAPPY());
    await openScaffoldPr(creds, ARGS, gh.fetch);
    expect(new Set(gh.calls.map((c) => c.auth))).toEqual(new Set(["Bearer t0ken"]));
  });

  // A retry after a half-applied run: the branch is ours, so it moves to the new commit.
  it("moves the branch when it already exists, rather than failing the retry", async () => {
    const gh = fakeGithub(HAPPY({
      "POST /repos/o/r/git/refs": { status: 422, body: { message: "Reference already exists" } },
      "PATCH /repos/o/r/git/refs/heads/chore/scaffold-api": { body: {} },
    }));
    await openScaffoldPr(creds, ARGS, gh.fetch);
    const patch = gh.calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toEqual({ sha: "commit1", force: true });
  });

  it("reuses the open pull request for the branch instead of opening a second", async () => {
    const gh = fakeGithub(HAPPY({
      "POST /repos/o/r/pulls": { status: 422, body: { message: "A pull request already exists" } },
      "GET /repos/o/r/pulls?state=open&head=o%3Achore%2Fscaffold-api": {
        body: [{ html_url: "https://github.com/o/r/pull/3", number: 3, head: { sha: "old" } }] },
    }));
    const pr = await openScaffoldPr(creds, ARGS, gh.fetch);
    expect(pr.url).toBe("https://github.com/o/r/pull/3");
  });

  // 422 from /pulls for any other reason must not be dressed up as "a PR exists".
  it("does not invent a pull request when the 422 was about something else", async () => {
    const gh = fakeGithub(HAPPY({
      "POST /repos/o/r/pulls": { status: 422, body: { message: "No commits between main and chore" } },
      "GET /repos/o/r/pulls?state=open&head=o%3Achore%2Fscaffold-api": { body: [] },
    }));
    await expect(openScaffoldPr(creds, ARGS, gh.fetch)).rejects.toThrow(/No commits between/);
  });

  it("says a repo with no commit needs one, instead of surfacing a bare 404", async () => {
    const gh = fakeGithub(HAPPY({ "GET /repos/o/r/git/ref/heads/main": { status: 409, body: { message: "Git Repository is empty." } } }));
    await expect(openScaffoldPr(creds, ARGS, gh.fetch)).rejects.toThrow(/no commit on 'main'.*README/);
  });

  it("names the status and the path on a failure, so a 401 says what it was doing", async () => {
    const gh = fakeGithub({ "GET /repos/o/r": { status: 401, body: { message: "Bad credentials" } } });
    const err = await openScaffoldPr(creds, ARGS, gh.fetch).catch((e) => e);
    expect(err).toBeInstanceOf(GithubError);
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/GET \/repos\/o\/r.*401.*Bad credentials/);
  });

  it("stops at the first failure and opens nothing after it", async () => {
    const gh = fakeGithub(HAPPY({ "POST /repos/o/r/git/trees": { status: 500, body: { message: "boom" } } }));
    await expect(openScaffoldPr(creds, ARGS, gh.fetch)).rejects.toThrow(/boom/);
    expect(gh.calls.some((c) => c.path.endsWith("/pulls"))).toBe(false);
    expect(gh.calls.some((c) => c.path.endsWith("/git/refs"))).toBe(false);
  });
});

describe("what CI says about a pull request", () => {
  const PR = { owner: "o", repo: "r", number: 7 };
  const runs = (check_runs: unknown[]) => fakeGithub({
    "GET /repos/o/r/pulls/7": { body: { head: { sha: "h1" } } },
    "GET /repos/o/r/commits/h1/check-runs?per_page=100": { body: { check_runs } },
  }).fetch;

  it("reads the CURRENT head of the pull request, not the sha it was opened at", async () => {
    const gh = fakeGithub({
      "GET /repos/o/r/pulls/7": { body: { head: { sha: "pushed-later" } } },
      "GET /repos/o/r/commits/pushed-later/check-runs?per_page=100": { body: { check_runs: [] } },
    });
    await checksForPr(creds, PR, gh.fetch);
    expect(gh.calls[1].path).toContain("pushed-later");
  });

  // "All of nothing passed" is true and useless: a repo with no workflow has no check runs.
  it("reports none as its own answer, not green", async () => {
    expect(await checksForPr(creds, PR, runs([]))).toEqual({ state: "none" });
  });
  it("is pending while any run is unfinished", async () => {
    expect(await checksForPr(creds, PR, runs([
      { name: "a", status: "completed", conclusion: "success" }, { name: "b", status: "in_progress", conclusion: null },
    ]))).toEqual({ state: "pending", total: 2, pending: 1 });
  });
  it("names the runs that failed", async () => {
    expect(await checksForPr(creds, PR, runs([
      { name: "lint", status: "completed", conclusion: "success" }, { name: "test", status: "completed", conclusion: "failure" },
      { name: "build", status: "completed", conclusion: "cancelled" },
    ]))).toEqual({ state: "failed", total: 3, failed: ["test", "build"] });
  });
  it("is green only when every run succeeded, treating neutral and skipped as not failures", async () => {
    expect(await checksForPr(creds, PR, runs([
      { name: "a", status: "completed", conclusion: "success" }, { name: "b", status: "completed", conclusion: "skipped" },
      { name: "c", status: "completed", conclusion: "neutral" },
    ]))).toEqual({ state: "green", total: 3 });
  });
});
