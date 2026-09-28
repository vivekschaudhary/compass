import { supabaseAdmin } from "../../../supabase";
import { resolveGithub, parsePrUrl, checksForPr } from "../../../github";
import type { Actor } from "../../actor";
import type { CriterionRow, Verdict } from "../types";
import { recordedPrsOf } from "./ticket";

/**
 * `ci is green` — what a scaffold row's checks look like with no local checkout to run them in.
 *
 * A `scaffold` row has no orchestrator running `_run_checks` in a worktree; GitHub Actions is what
 * verifies the pull request, on the ACTUAL repo the scaffold wrote its own CI workflow into. This
 * reads the same thing a person clicking through to the PR would see, on the PR's CURRENT head —
 * a push after this criterion first ran must be re-checked, not judged against the original commit.
 */
export async function evaluateCiChecks(
  actor: Actor,
  c: CriterionRow,
  taskId: string | null,
): Promise<Verdict> {
  const sb = supabaseAdmin();
  if (!sb || !taskId) return { state: "unmeasurable", why: "no task to read a run from" };

  const { data: task } = await sb.from("work_task").select("workflow_run_id").eq("id", taskId).maybeSingle();
  if (!task?.workflow_run_id) return { state: "unmeasurable", why: "not a row of a run" };

  const { data: run } = await sb.from("workflow_run").select("subject_ref").eq("id", task.workflow_run_id).maybeSingle();
  const key = (run?.subject_ref as string | null) ?? null;
  if (!key) return { state: "unmeasurable", why: "this run has no repo subject to read CI for" };

  const prs = await recordedPrsOf(task.workflow_run_id as string);
  if (!prs.length)
    return { state: "unsatisfied", source: "compass", detail: `${key}: the run recorded no pull request — nothing to check.` };
  const where = parsePrUrl(prs[prs.length - 1]);
  if (!where) return { state: "unmeasurable", why: `could not read a repo and number from '${prs[prs.length - 1]}'` };

  const { data: repo } = await sb.from("repo").select("url, access_token").eq("engagement_id", actor.engagementId).eq("key", key).maybeSingle();
  const { data: eng } = await sb.from("engagement").select("github_token").eq("id", actor.engagementId).maybeSingle();
  const creds = resolveGithub(repo, eng);
  if (!creds) return { state: "unmeasurable", why: `no GitHub token is configured for repo '${key}' (or the engagement, or the server)` };

  let checks;
  try {
    checks = await checksForPr(creds, where);
  } catch (e) {
    return { state: "unmeasurable", why: e instanceof Error ? e.message : String(e) };
  }
  const label = (repo?.url as string | null) ?? key;
  switch (checks.state) {
    case "none":
      return { state: "unsatisfied", source: "tracker", detail: `${label}: no CI check runs on the pull request — nothing verified it.` };
    case "pending":
      return { state: "unmeasurable", why: `${checks.pending} of ${checks.total} check(s) still running on the pull request` };
    case "failed":
      return { state: "unsatisfied", source: "tracker", detail: `${label}: ${checks.failed.join(", ")} failed.` };
    case "green":
      return { state: "satisfied", source: "tracker", detail: `${label}: all ${checks.total} check(s) passed.` };
  }
}
