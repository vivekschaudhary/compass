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
  taskSubjectRef: string | null = null,
): Promise<{ ref: string | null; key: string | null; epicKey?: string | null } | null> {
  // A task that names its own subject (a materialized per-repo task inside a parent run) is about
  // that subject, whatever the run it sits in is about. The run's subject is the fallback.
  if (taskSubjectRef) return { ref: taskSubjectRef, key: null };
  if (!runId) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("workflow_run")
    .select("subject_ref, subject_key, engagement_id, parent_task_id").eq("id", runId).maybeSingle();
  if (!data?.subject_ref && !data?.subject_key) return null;
  const subject: { ref: string | null; key: string | null; epicKey?: string | null } =
    { ref: data.subject_ref ?? null, key: data.subject_key ?? null };
  // A top-level run about a story: say which epic the story is under, so a path naming `{epic}`
  // reads that epic's pages. An epic's ref matches no story row, so every other run is untouched.
  if (data.subject_ref && !data.parent_task_id) {
    subject.epicKey = await epicKeyOfStory(data.engagement_id as string, data.subject_ref as string);
  }
  return subject;
}

/**
 * The ticket key of the epic a story belongs to. Undefined when `ref` is not a story at all;
 * null when it is a story whose epic is not on the board — the caller must tell those apart, since
 * the second means "this run is about a story and its epic is unknown", not "this is an epic run".
 */
async function epicKeyOfStory(engagementId: string, ref: string): Promise<string | null | undefined> {
  const sb = supabaseAdmin();
  if (!sb) return undefined;
  const { data: stories } = await sb.from("backlog_item")
    .select("parent_ref, created_at").eq("engagement_id", engagementId).eq("kind", "story").eq("ref", ref)
    .order("created_at", { ascending: false });
  if (!stories?.length) return undefined;
  const parent = stories.find((s) => s.parent_ref)?.parent_ref as string | undefined;
  if (!parent) return null;
  const { data: epics } = await sb.from("backlog_item")
    .select("ticket_key").eq("engagement_id", engagementId).eq("kind", "epic").eq("ref", parent)
    .not("ticket_key", "is", null).order("created_at", { ascending: false });
  return (epics?.[0]?.ticket_key as string | undefined) ?? null;
}
