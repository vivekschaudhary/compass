import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const state: { tasks: Row[]; runs: Row[]; repos: Row[]; engs: Row[] } = { tasks: [], runs: [], repos: [], engs: [] };
const opened: Record<string, unknown>[] = [];
const gh = { fail: null as Error | null };

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let rows = table === "work_task" ? state.tasks : table === "workflow_run" ? state.runs
        : table === "repo" ? state.repos : state.engs;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return chain; },
        maybeSingle: async () => ({ data: rows[0] ?? null }),
      };
      return chain;
    },
  }),
}));
vi.mock("../github", async (orig) => ({
  ...(await orig<typeof import("../github")>()),
  openScaffoldPr: async (_c: unknown, args: Record<string, unknown>) => {
    if (gh.fail) throw gh.fail;
    opened.push(args);
    return { url: "https://github.com/o/r/pull/9", number: 9, branch: args.branch, headSha: "s", base: "main" };
  },
}));

const { validateScaffoldFiles, checksOf, runScaffold } = await import("./scaffold");
const { GithubError } = await import("../github");

const CFG = "checks:\n  - cd api && npm test\n  - cd api && npm run lint\n";
const good = () => [
  { path: "compass/config.yaml", content: CFG },
  { path: ".github/workflows/ci.yml", content: "name: ci\non: pull_request\n" },
  { path: "README.md", content: "hi" },
];
const problems = (files: unknown) => { const v = validateScaffoldFiles(files); return v.ok ? [] : v.problems; };

describe("reading checks: out of a config.yaml", () => {
  it("reads a block list", () => expect(checksOf(CFG)).toEqual(["cd api && npm test", "cd api && npm run lint"]));
  it("reads an inline list", () => expect(checksOf('checks: ["npm test", lint]')).toEqual(["npm test", "lint"]));
  it("strips quotes from list items", () => expect(checksOf("checks:\n  - 'npm test'\n")).toEqual(["npm test"]));
  // The failure that reads as fine: `checks:` present and empty.
  it("finds nothing in an empty or missing list", () => {
    expect(checksOf("checks:\n")).toEqual([]);
    expect(checksOf("stack: swift\n")).toEqual([]);
    expect(checksOf("checks: []\n")).toEqual([]);
  });
  it("does not read a list that belongs to another key", () => {
    expect(checksOf("connectors:\n  - github\n")).toEqual([]);
  });
});

describe("validating the files a scaffold returns", () => {
  it("accepts a scaffold with a config, its checks, and a CI workflow", () => {
    expect(validateScaffoldFiles(good())).toEqual({ ok: true, files: good() });
  });
  it("refuses an empty list rather than scaffolding nothing", () => {
    expect(problems([])[0]).toMatch(/scaffolds nothing/);
    expect(problems(undefined)[0]).toMatch(/scaffolds nothing/);
  });
  it("refuses a scaffold with no compass/config.yaml", () => {
    expect(problems(good().filter((f) => f.path !== "compass/config.yaml")).join()).toMatch(/config\.yaml. is missing/);
  });
  it("refuses a config.yaml that lists no checks — a gate with nothing to run", () => {
    const f = good(); f[0].content = "stack: swift\n";
    expect(problems(f).join()).toMatch(/no `checks:` commands/);
  });
  it("refuses a scaffold with no CI workflow, since the gate reads CI's result", () => {
    expect(problems(good().filter((f) => !f.path.startsWith(".github"))).join()).toMatch(/no `\.github\/workflows/);
  });
  it.each(["/etc/passwd", "../up.txt", "a/../b.txt", "a//b.txt", "./a.txt", "a\\b.txt", ".git/config"])(
    "refuses the path %s", (path) => {
      expect(problems([...good(), { path, content: "x" }]).join()).toMatch(/clean repo-relative|inside \.git/);
    });
  it("refuses the same path twice, ignoring case", () => {
    expect(problems([...good(), { path: "readme.md", content: "x" }]).join()).toMatch(/appears twice/);
  });
  it("refuses a file with missing content, but allows an empty one", () => {
    expect(problems([...good(), { path: "a.txt" }]).join()).toMatch(/has no content/);
    expect(problems([...good(), { path: ".gitkeep", content: "" }])).toEqual([]);
  });
  it("refuses an oversized file", () => {
    expect(problems([...good(), { path: "big.txt", content: "x".repeat(300 * 1024) }]).join()).toMatch(/over the .* limit for one file/);
  });
  it("reports every problem at once, not the first", () => {
    const p = problems([{ path: "../x", content: "1" }, { path: "y" }]);
    expect(p.length).toBeGreaterThanOrEqual(4);
  });
});

const seed = (over: { subject?: string | null; repo?: Row | null; token?: string | null } = {}) => {
  state.tasks = [{ id: "t1", workflow_run_id: "r1" }];
  state.runs = [{ id: "r1", subject_ref: over.subject === undefined ? "api" : over.subject }];
  state.repos = over.repo === null ? [] : [{ engagement_id: "e1", key: "api", name: "kt-api", url: "https://github.com/o/r", ...over.repo }];
  state.engs = [{ id: "e1", github_token: over.token === undefined ? "tok" : over.token }];
};
const IN = { summary: "Scaffold the API", files: good() };
beforeEach(() => { opened.length = 0; gh.fail = null; vi.unstubAllEnvs(); vi.stubEnv("GITHUB_TOKEN", ""); });

describe("running a scaffold", () => {
  it("opens the pull request in the repo the run's subject names", async () => {
    seed();
    const r = await runScaffold("e1", "t1", IN);
    expect(r).toMatchObject({ ok: true, prUrl: "https://github.com/o/r/pull/9", branch: "chore/scaffold-api", refusal: null, error: null });
    expect(opened[0]).toMatchObject({ owner: "o", repo: "r", branch: "chore/scaffold-api" });
    expect((opened[0].files as unknown[]).length).toBe(3);
  });
  it("puts the file list in the pull request body, so a reviewer sees what it contains", async () => {
    seed();
    await runScaffold("e1", "t1", IN);
    expect(String(opened[0].body)).toContain("`compass/config.yaml`");
  });

  // Every refusal is BEFORE anything is written, and says so.
  it("refuses a run with no subject", async () => {
    seed({ subject: null });
    const r = await runScaffold("e1", "t1", IN);
    expect(r.refusal).toMatch(/names no repo.*Nothing was written/);
    expect(opened).toEqual([]);
  });
  it("refuses a repo key that is not registered, and names it", async () => {
    seed({ repo: null });
    expect((await runScaffold("e1", "t1", IN)).refusal).toMatch(/No repo 'api' is registered on this engagement/);
  });
  it("refuses a repo whose URL is not GitHub", async () => {
    seed({ repo: { url: "https://gitlab.com/o/r" } });
    expect((await runScaffold("e1", "t1", IN)).refusal).toMatch(/no GitHub URL/);
    seed({ repo: { url: null } });
    expect((await runScaffold("e1", "t1", IN)).refusal).toMatch(/none set/);
  });
  it("refuses when there is no token anywhere", async () => {
    seed({ token: null });
    expect((await runScaffold("e1", "t1", IN)).refusal).toMatch(/No GitHub token/);
    expect(opened).toEqual([]);
  });
  it("falls back to the server's token", async () => {
    seed({ token: null });
    vi.stubEnv("GITHUB_TOKEN", "server");
    expect((await runScaffold("e1", "t1", IN)).ok).toBe(true);
  });

  // A GitHub failure is not a refusal: it was attempted, and the message is GitHub's.
  it("reports GitHub's own message when the call fails, and is not ok", async () => {
    seed();
    gh.fail = new GithubError(403, "GitHub POST /repos/o/r/git/trees → 403: Resource not accessible by personal access token");
    const r = await runScaffold("e1", "t1", IN);
    expect(r.ok).toBe(false);
    expect(r.refusal).toBeNull();
    expect(r.error).toMatch(/Resource not accessible/);
    expect(r.prUrl).toBeNull();
  });
});
