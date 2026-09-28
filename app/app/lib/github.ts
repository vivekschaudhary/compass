// GitHub (REST) — the write path a scaffold takes: a branch, a commit of files, a pull request, and
// the CI result read back.
//
// This is NOT the orchestrator. The v1 orchestrator edits code in a local checkout, so it needs a
// clone on the machine that runs it. A scaffold is greenfield and small, and needs no checkout at
// all: the git data API takes the files as text, so the app can do it from anywhere it is hosted.
//
// Per-engagement token wins; fall back to the server env. Returns null if there is none, so the
// caller can say "no GitHub token" instead of failing on a 401 that names nothing.

import { decryptSecret } from "./crypto";

export type GithubCreds = { token: string };

export function resolveGithub(eng: { github_token?: string | null } | null | undefined): GithubCreds | null {
  // Stored encrypted; a legacy plaintext value passes through `decryptSecret` unchanged.
  const token = decryptSecret(eng?.github_token) || process.env.GITHUB_TOKEN || "";
  return token ? { token } : null;
}

/** `https://github.com/o/r`, `…/r.git` or `git@github.com:o/r.git` → `{ owner, repo }`. */
export function parseRepoUrl(url: string | null | undefined): { owner: string; repo: string } | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  const m =
    raw.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i) ??
    raw.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/** `https://github.com/o/r/pull/12` → `{ owner, repo, number }`. */
export function parsePrUrl(url: string | null | undefined): { owner: string; repo: string; number: number } | null {
  const m = (url ?? "").match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i);
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}

export class GithubError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GithubError";
  }
}

type Fetch = typeof fetch;

async function gh<T>(
  creds: GithubCreds, method: string, path: string, body?: unknown, fetchImpl: Fetch = fetch,
): Promise<T> {
  const res = await fetchImpl(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON: keep the text */ }
  if (!res.ok) {
    const msg = (json as { message?: string } | null)?.message ?? text.slice(0, 200) ?? res.statusText;
    throw new GithubError(res.status, `GitHub ${method} ${path} → ${res.status}: ${msg}`);
  }
  return json as T;
}

export type ScaffoldFile = { path: string; content: string };

export type OpenedPr = { url: string; number: number; branch: string; headSha: string; base: string };

/**
 * Put `files` on a new branch of `owner/repo` and open a pull request against its default branch.
 *
 * Idempotent on retry, because a scaffold that failed halfway must be re-runnable: the branch is
 * moved to the new commit if it already exists, and an open pull request for it is reused. The
 * branch is ours (`chore/scaffold-…`), so moving it is not taking anything from anyone.
 *
 * THE FILES ARE COMMITTED AS ONE COMMIT, off the default branch's current tree, through the git data
 * API. One `PUT /contents` per file would be one commit per file and a scaffold that looks like a
 * stutter in the history.
 */
export async function openScaffoldPr(
  creds: GithubCreds,
  args: {
    owner: string; repo: string; branch: string; title: string; body: string; message: string;
    files: ScaffoldFile[];
  },
  fetchImpl: Fetch = fetch,
): Promise<OpenedPr> {
  const { owner, repo, branch, files } = args;
  const base = `/repos/${owner}/${repo}`;
  const call = <T>(method: string, path: string, body?: unknown) => gh<T>(creds, method, `${base}${path}`, body, fetchImpl);

  const info = await call<{ default_branch: string }>("GET", "");
  const def = info.default_branch;

  // A repo with no commit has no default branch ref to build on. Said plainly rather than left to
  // surface as a 404 on the ref: the fix is a README, and it is not the app's to invent one.
  let baseSha: string;
  try {
    baseSha = (await call<{ object: { sha: string } }>("GET", `/git/ref/heads/${def}`)).object.sha;
  } catch (e) {
    if (e instanceof GithubError && (e.status === 404 || e.status === 409))
      throw new GithubError(e.status, `${owner}/${repo} has no commit on '${def}' to build on. Create an initial commit (a README is enough), then run this again.`);
    throw e;
  }
  const baseTree = (await call<{ tree: { sha: string } }>("GET", `/git/commits/${baseSha}`)).tree.sha;

  const tree = await call<{ sha: string }>("POST", "/git/trees", {
    base_tree: baseTree,
    tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
  });
  const commit = await call<{ sha: string }>("POST", "/git/commits", {
    message: args.message, tree: tree.sha, parents: [baseSha],
  });

  try {
    await call("POST", "/git/refs", { ref: `refs/heads/${branch}`, sha: commit.sha });
  } catch (e) {
    if (!(e instanceof GithubError) || e.status !== 422) throw e;
    await call("PATCH", `/git/refs/heads/${branch}`, { sha: commit.sha, force: true });
  }

  let pr: { html_url: string; number: number; head: { sha: string } } | null = null;
  try {
    pr = await call("POST", "/pulls", { title: args.title, head: branch, base: def, body: args.body });
  } catch (e) {
    if (!(e instanceof GithubError) || e.status !== 422) throw e;
    const open = await call<{ html_url: string; number: number; head: { sha: string } }[]>(
      "GET", `/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`);
    if (!open.length) throw e;   // 422 for some other reason: do not pretend a PR exists
    pr = open[0];
  }
  return { url: pr!.html_url, number: pr!.number, branch, headSha: commit.sha, base: def };
}

export type CheckSummary =
  | { state: "none" }
  | { state: "pending"; total: number; pending: number }
  | { state: "failed"; total: number; failed: string[] }
  | { state: "green"; total: number };

/**
 * What CI says about a pull request's CURRENT head.
 *
 * Read from the head as it is NOW, not from the sha recorded when the PR was opened: a fix pushed
 * later is what the gate must judge. `none` is its own answer — a repo with no workflow has no check
 * runs at all, and "all of nothing passed" is the aggregate-over-zero-rows trap.
 */
export async function checksForPr(
  creds: GithubCreds, pr: { owner: string; repo: string; number: number }, fetchImpl: Fetch = fetch,
): Promise<CheckSummary> {
  const base = `/repos/${pr.owner}/${pr.repo}`;
  const head = (await gh<{ head: { sha: string } }>(creds, "GET", `${base}/pulls/${pr.number}`, undefined, fetchImpl)).head.sha;
  const runs = await gh<{ check_runs: { name: string; status: string; conclusion: string | null }[] }>(
    creds, "GET", `${base}/commits/${head}/check-runs?per_page=100`, undefined, fetchImpl);
  const all = runs.check_runs ?? [];
  if (!all.length) return { state: "none" };
  const pending = all.filter((r) => r.status !== "completed");
  if (pending.length) return { state: "pending", total: all.length, pending: pending.length };
  // `success`, plus `neutral`/`skipped`, which are not failures. Anything else is one.
  const bad = all.filter((r) => !["success", "neutral", "skipped"].includes(r.conclusion ?? ""));
  return bad.length
    ? { state: "failed", total: all.length, failed: bad.map((r) => r.name) }
    : { state: "green", total: all.length };
}
