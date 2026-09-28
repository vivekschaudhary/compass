// Writing a scaffold into a repo, from the app.
//
// The agent's `scaffold` tool returns files; this validates them, then commits them to a branch of
// the run's repo through the GitHub API and opens the pull request. No checkout, no orchestrator, no
// Python process — a scaffold is greenfield and small, and the git data API takes files as text.
//
// THE MODEL WRITES THE FILES AND THE APP WRITES THE OUTCOME, as with `code`: the pull request URL
// and branch come back from GitHub, so a scaffold that opened no pull request cannot be claimed into
// existence. And the criteria that a scaffold ship its own checks are ENFORCED here, not only stated:
// a criterion is guidance to the agent, and a scaffold with no CI and no `checks:` would open a PR
// nothing can verify.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { resolveGithub, parseRepoUrl, openScaffoldPr, GithubError, type ScaffoldFile } from "../github";

const MAX_FILES = 200;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;

/** The commands under `checks:` in a config.yaml — block list or inline `[a, b]`. */
export function checksOf(yaml: string): string[] {
  const inline = yaml.match(/^checks:\s*\[(.*)\]\s*$/m);
  if (inline) return inline[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const block = yaml.match(/^checks:[ \t]*\r?\n((?:[ \t]+-[ \t]+\S.*(?:\r?\n|$))+)/m);
  if (!block) return [];
  return block[1].split(/\r?\n/)
    .map((l) => l.replace(/^[ \t]+-[ \t]+/, "").trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

export type Validated =
  | { ok: true; files: ScaffoldFile[] }
  | { ok: false; problems: string[] };

/** Every problem at once — a model correcting a scaffold should not learn them one at a time. */
export function validateScaffoldFiles(raw: unknown): Validated {
  const problems: string[] = [];
  if (!Array.isArray(raw) || raw.length === 0)
    return { ok: false, problems: ["`files` is empty. A scaffold with no files scaffolds nothing."] };
  if (raw.length > MAX_FILES) problems.push(`${raw.length} files is over the limit of ${MAX_FILES}. A scaffold is a starting structure, not the product.`);

  const files: ScaffoldFile[] = [];
  const seen = new Set<string>();
  let total = 0;
  raw.forEach((f: { path?: unknown; content?: unknown }, i: number) => {
    const at = `file ${i + 1}`;
    const path = typeof f?.path === "string" ? f.path : "";
    const content = typeof f?.content === "string" ? f.content : null;
    if (!path.trim()) { problems.push(`${at} has no path.`); return; }
    if (content === null) { problems.push(`${path} has no content (an empty file is "", not missing).`); return; }
    const segs = path.split("/");
    if (path.startsWith("/") || path.includes("\\") || segs.some((s) => s === "" || s === "." || s === ".."))
      problems.push(`${path} is not a clean repo-relative path (no leading "/", "..", ".", empty segments or backslashes).`);
    if (segs[0] === ".git") problems.push(`${path} is inside .git.`);
    if (path.length > 200) problems.push(`${path.slice(0, 40)}… is over 200 characters.`);
    const key = path.toLowerCase();
    if (seen.has(key)) problems.push(`${path} appears twice.`);
    seen.add(key);
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_FILE_BYTES) problems.push(`${path} is ${bytes} bytes, over the ${MAX_FILE_BYTES} limit for one file.`);
    total += bytes;
    files.push({ path, content });
  });
  if (total > MAX_TOTAL_BYTES) problems.push(`The files total ${total} bytes, over the ${MAX_TOTAL_BYTES} limit.`);

  // What the criteria state, enforced. A scaffold that cannot verify itself opens a pull request
  // nothing can vouch for.
  const config = files.find((f) => f.path === "compass/config.yaml");
  if (!config) problems.push("`compass/config.yaml` is missing. Every repo carries one, with the `checks:` that verify it.");
  else if (checksOf(config.content).length === 0)
    problems.push("`compass/config.yaml` has no `checks:` commands. List the commands that build, lint and test this repo.");
  if (!files.some((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f.path)))
    problems.push("There is no `.github/workflows/*.yml`. CI is what runs the checks on the pull request, and the gate reads its result — without a workflow there is nothing to read.");

  return problems.length ? { ok: false, problems } : { ok: true, files };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "repo";

export type ScaffoldRun = {
  ok: boolean;
  prUrl: string | null;
  branch: string | null;
  fileCount: number;
  /** Why nothing was attempted. Null when GitHub was called, whatever came back. */
  refusal: string | null;
  /** What GitHub said, when it was called and failed. */
  error: string | null;
  repoName: string | null;
};

/** The repo key this run is about — the subject `scaffold-repo` was opened with. */
async function subjectOf(taskId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data: task } = await sb.from("work_task").select("workflow_run_id").eq("id", taskId).maybeSingle();
  if (!task?.workflow_run_id) return null;
  const { data: run } = await sb.from("workflow_run").select("subject_ref").eq("id", task.workflow_run_id).maybeSingle();
  return (run?.subject_ref as string | null) ?? null;
}

export async function runScaffold(
  engagementId: string,
  taskId: string,
  input: { summary: string; files: ScaffoldFile[] },
): Promise<ScaffoldRun> {
  const none = { ok: false, prUrl: null, branch: null, fileCount: input.files.length, error: null, repoName: null };
  const sb = supabaseAdmin();
  if (!sb) return { ...none, refusal: "Supabase is not configured." };

  const key = await subjectOf(taskId);
  if (!key)
    return { ...none, refusal: "This scaffold run names no repo. It is opened once per registered repo, with the repo's key as its subject. Nothing was written." };

  const { data: repo } = await sb.from("repo")
    .select("key, name, url").eq("engagement_id", engagementId).eq("key", key).maybeSingle();
  if (!repo)
    return { ...none, refusal: `No repo '${key}' is registered on this engagement. Register it with its GitHub URL first. Nothing was written.` };
  const where = parseRepoUrl(repo.url as string | null);
  if (!where)
    return { ...none, repoName: repo.name as string, refusal: `Repo '${key}' has no GitHub URL the app can read (${repo.url ?? "none set"}). Set it to https://github.com/<owner>/<name>. Nothing was written.` };

  const { data: eng } = await sb.from("engagement").select("github_token").eq("id", engagementId).maybeSingle();
  const creds = resolveGithub(eng);
  if (!creds)
    return { ...none, repoName: repo.name as string, refusal: "No GitHub token is configured for this engagement (and GITHUB_TOKEN is not set on the server). Nothing was written." };

  const branch = `chore/scaffold-${slug(key)}`;
  try {
    const pr = await openScaffoldPr(creds, {
      ...where, branch, files: input.files,
      title: `Scaffold ${repo.name ?? key}`,
      body: `${input.summary}\n\n${input.files.length} file(s), written by Compass from the accepted scaffold plan.\n\n` +
        input.files.map((f) => `- \`${f.path}\``).join("\n"),
      message: `Scaffold ${repo.name ?? key}`,
    });
    return { ...none, ok: true, prUrl: pr.url, branch: pr.branch, refusal: null, repoName: (repo.name as string) ?? key };
  } catch (e) {
    return { ...none, refusal: null, repoName: (repo.name as string) ?? key, error: e instanceof GithubError || e instanceof Error ? e.message : String(e) };
  }
}
