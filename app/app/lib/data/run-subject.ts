import "server-only";
import { supabaseAdmin } from "../supabase";

/**
 * What the run a task belongs to is ABOUT, when it is about one thing.
 *
 * Null for every run that covers its whole engagement — which is all of them except the per-epic
 * technical designs, so the common path is one cheap read that returns nothing and changes nothing.
 *
 * Lives in the data layer, not with the agent's context loader, because the gates and the
 * materialiser resolve paths from it too: keeping it in `agent/context` made `data` import `agent`
 * while `agent` imports `data`.
 *
 * `taskSubjectRef` — the TASK's own `work_task.subject_ref`, when the caller already has it. Wins
 * over the run's subject: inline-materialized tasks (`scaffold-repos`' per-repo pairs) share one run
 * across several subjects, so the run can no longer answer "what is THIS task about" — only the task
 * itself can. Every run still answering for all of its own tasks (every case before scaffold) passes
 * `null` here and nothing changes.
 */
export async function subjectOfRun(
  runId: string | null,
  taskSubjectRef?: string | null,
): Promise<{ ref: string | null; key: string | null } | null> {
  if (taskSubjectRef) return { ref: taskSubjectRef, key: null };
  if (!runId) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("workflow_run")
    .select("subject_ref, subject_key").eq("id", runId).maybeSingle();
  if (!data?.subject_ref && !data?.subject_key) return null;
  return { ref: data.subject_ref ?? null, key: data.subject_key ?? null };
}
