// Handing a scaffold to the orchestrator — the `scaffold` tool's TS-side half.
//
// Deliberately NOT a copy of `code-run.ts`'s spawn. `runCode()` targets v1's own graph by
// `--step N`, where N is v1's hardcoded step number inside its internal `.md` file for the run's
// `workflow` — `foundation-architecture.md` today has six rows, none of them a per-repo scaffold
// step. Blindly reusing that mechanism here would pass whatever `ord` the materialized
// `execute-scaffold` task happens to carry (from `scaffold-repo`'s OWN step numbering, ord 1) as
// `--step 1` of `foundation-architecture` — which is v1's "Research the ground" step, not scaffold.
// That would spawn the orchestrator against the WRONG step of a graph that exists and is live, which
// is worse than refusing outright.
//
// So this refuses until the orchestrator actually has a scaffold step to target — see the refusal
// text below for exactly what that needs to be. Everything up to the spawn (resolving the repo, the
// subject, confirming there is something to scaffold into) is real and already correct for when it
// does.

import "server-only";
import { existsSync } from "fs";
import { supabaseAdmin } from "../supabase";

export type ScaffoldRun = {
  ok: boolean;
  exit: number | null;
  branch: string | null;
  prUrl: string | null;
  log: string;
  refusal: string | null;
  repoName: string | null;
};

/**
 * Which repo this task's own subject names, falling back to the first repo with a real checkout.
 *
 * Subject-first, unlike `code-run.ts`'s `repoFor` (which only ever serves one subject per
 * engagement): a materialized `execute-scaffold` task carries its OWN `subject_ref` (the repo key,
 * e.g. `'app'`) — see `work_task.subject_ref` (migration `task_subject.sql`) — so the right repo is
 * the one that task actually names, not just whichever repo happens to have a checkout first.
 */
async function repoFor(
  engagementId: string,
  taskId: string,
): Promise<{ path: string; name: string; subject: string | null } | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: task } = await sb.from("work_task")
    .select("subject_ref").eq("id", taskId).maybeSingle();
  const subject = (task?.subject_ref as string | null) ?? null;

  const { data } = await sb.from("repo")
    .select("key, name, local_path").eq("engagement_id", engagementId).order("ord");
  const rows = data ?? [];

  const match = subject ? rows.find((r) => r.key === subject) : null;
  const row = match ?? rows.find((r) => {
    const p = (r.local_path as string | null)?.trim();
    return p && existsSync(p);
  });
  if (!row) return null;

  const path = (row.local_path as string | null)?.trim();
  if (!path || !existsSync(path)) return null;
  return { path, name: (row.name as string) || (row.key as string), subject };
}

export async function runScaffold(
  engagementId: string,
  taskId: string,
  _intent: { framework: string; options: string },
): Promise<ScaffoldRun> {
  const empty = { ok: false, exit: null, branch: null, prUrl: null, log: "", repoName: null };

  const repo = await repoFor(engagementId, taskId);
  if (!repo) {
    return {
      ...empty,
      refusal:
        "No repository with a working local path is configured for this subject. Set one in " +
        "Settings → Repositories; without a checkout there is nowhere to scaffold into.",
    };
  }

  // THE ACTUAL GAP. Once the orchestrator has a real scaffold step to target — a new row in
  // `foundation-architecture.md` (or its own `.md`) that runs a real framework generator, commits,
  // and opens a pull request — this becomes a `spawn("python3", [...])` call the same shape as
  // `runCode()`'s, carrying `repo.path`, `repo.subject`, and `_intent.framework`/`_intent.options`
  // instead of `--story`. Until then, refusing here is the correct behaviour, not a placeholder to
  // silently work around.
  return {
    ...empty,
    repoName: repo.name,
    refusal:
      "The orchestrator has no scaffold step to run yet — nothing was spawned. The intent " +
      "(framework, options) is recorded on this task's conversation; building the actual scaffold " +
      "step is separate, still-open work.",
  };
}
