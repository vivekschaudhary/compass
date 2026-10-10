import { supabaseAdmin, must } from "../../../supabase";
import { resolveNestedVersion } from "../../nested-version";
import type { CriterionRow, Verdict } from "../types";

/**
 * Every sibling task an INLINE fan-out row materialized has closed.
 *
 * `evaluateNested` (`./nested.ts`) answers "has every child run this row opened closed?" by
 * looking for `workflow_run` rows with `parent_task_id` pointing at it. That question has no
 * answer for a row whose fan-out `mode` is `inline` (`../../../fan-out-kinds.ts`):
 * `materializeInlinePerSubject` never opens a child run at all — Jira caps nesting one level below
 * an epic, so a repo's scaffold steps are inserted as plain sibling tasks in the SAME run instead.
 * A `scaffold-repos` row gated with `evaluateNested` found zero child runs, forever, and could
 * never close — this is its inline counterpart, reading siblings instead of runs.
 *
 * UNMEASURABLE when nothing has been materialized yet, never satisfied — "all of nothing has
 * closed" is true and useless, and would let the row close before its own fan-out ever ran (rule
 * 11, same trap `evaluateNested` already avoids).
 */
export async function evaluateInlineFanOut(
  c: CriterionRow,
  taskId: string | null,
): Promise<Verdict> {
  if (!taskId)
    return { state: "unmeasurable", why: "not a row of a run, so nothing nests under it" };
  const sb = supabaseAdmin();
  if (!sb) return { state: "unmeasurable", why: "no database" };

  const resolved = await resolveNestedVersion(taskId);
  if (!resolved)
    return { state: "unmeasurable", why: "this row's nested workflow could not be resolved" };
  if (!resolved.runId)
    return { state: "unmeasurable", why: "this row has no run for its siblings to live in" };

  const { data: templateSteps } = await sb
    .from("workflow_step")
    .select("task")
    .eq("workflow_version_id", resolved.versionId);
  const taskNames = new Set((templateSteps ?? []).map((s) => s.task as string));
  if (!taskNames.size)
    return { state: "unmeasurable", why: `'${resolved.code}' has no steps to materialize` };

  // Materialized siblings carry a `subject_ref` (the repo, the epic, …); the nesting row itself
  // does not — excluding null keeps this from counting its own row as one of its children.
  const siblings = must(
    "read inline fan-out siblings",
    await sb
      .from("work_task")
      .select("state, subject_ref, workflow_step(task)")
      .eq("workflow_run_id", resolved.runId)
      .not("subject_ref", "is", null),
  );
  const stepTaskOf = (t: NonNullable<typeof siblings>[number]) => {
    const ws = t.workflow_step as { task?: string } | { task?: string }[] | null;
    return Array.isArray(ws) ? ws[0]?.task : ws?.task;
  };
  const mine = (siblings ?? []).filter((t) => {
    const task = stepTaskOf(t);
    return !!task && taskNames.has(task);
  });
  if (!mine.length) {
    return {
      state: "unmeasurable",
      why: `no ${c.subjectRef ?? "inline"} row has been materialized yet`,
    };
  }

  const open = mine.filter((t) => t.state !== "closed").length;
  const what = c.subjectRef ?? "inline";
  return open === 0
    ? { state: "satisfied", source: "compass", detail: `All ${mine.length} ${what} row(s) closed.` }
    : {
        state: "unsatisfied",
        source: "compass",
        detail: `${open} of ${mine.length} ${what} row(s) still open.`,
      };
}
