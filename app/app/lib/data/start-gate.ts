// What blocks a task from starting — moved here from `start_task`'s own SQL body.
//
// WHY IT MOVED. `20260923192824_run_retry_and_sweep.sql` needed to add two retry-reset fields to
// `start_task`'s final `update`, and did it by replacing the whole function body — which is how a
// Postgres function is edited, there is no diff, only a new CREATE OR REPLACE. It replaced the
// fully-evolved body (Ready-criteria check + `depends_on` check, grown over five migrations since
// `20260101004200_depends_on.sql`) with what reads like the very first, pre-gate version. ~70 lines
// of enforcement silently stopped running, and the only thing left disabling the Start button was
// the UI's own `readyMet` — a display convenience, not a guarantee, and nothing stopped a direct
// RPC call from starting any idle row regardless of Ready or dependency order.
//
// So the check lives here instead: reviewable and unit-testable the normal way, and the SQL
// function goes back to doing exactly one thing — flip an idle row to running — which is small
// enough that replacing its body whole is safe. `startTask` in `tasks.ts` is the ONLY caller of the
// RPC (the machine-row auto-start in `phases.ts` calls `startTask` too, not the RPC directly), so
// this is the single point of enforcement.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { measureTask, type CriterionStatus } from "./gates";
import type { Actor } from "./actor";

export type Blocker = { kind: "ready" | "depends_on"; label: string };

/**
 * Pure: given what has already been measured and which dependency rows are still open, what
 * stops this row from starting. Split out from `unmetToStart` so the decision is testable without
 * a database — same split `reset-workflow.ts`/`reset-workflow-apply.ts` already uses.
 */
export function blockersFrom(ready: CriterionStatus[], waitingOn: string[]): Blocker[] {
  const blockers: Blocker[] = [];
  for (const c of ready) {
    if (c.verdict.state === "satisfied") continue;
    const label =
      c.verdict.state === "unmeasurable"
        ? `${c.statement} (not checked — ${c.verdict.why})`
        : `${c.statement} (not met: ${c.verdict.detail})`;
    blockers.push({ kind: "ready", label });
  }
  for (const title of waitingOn) blockers.push({ kind: "depends_on", label: title });
  return blockers;
}

/** One reader-facing message, or null when nothing is blocking. Same wording the old RPC raised. */
export function describeBlockers(blockers: Blocker[]): string | null {
  if (!blockers.length) return null;
  const ready = blockers.filter((b) => b.kind === "ready").map((b) => b.label);
  const waiting = blockers.filter((b) => b.kind === "depends_on").map((b) => b.label);
  const parts: string[] = [];
  if (ready.length) parts.push(`Not ready:\n  ${ready.join("\n  ")}`);
  if (waiting.length) parts.push(`Waiting on:\n  ${waiting.join("\n  ")}`);
  return parts.join("\n");
}

/**
 * The rows `dependsOn` names, in THIS run, that have not closed — titled, not counted, so a
 * refusal says what to go and do rather than sending someone to look. Scoped to the run: a
 * dependency satisfied on a different engagement's run is not satisfied here, same rule the old
 * SQL version enforced.
 */
async function openDependencies(
  workflowVersionId: string,
  runId: string,
  dependsOn: string[],
): Promise<string[]> {
  const sb = supabaseAdmin();
  if (!sb || !dependsOn.length) return [];

  const { data: steps } = await sb
    .from("workflow_step")
    .select("id, title, ord")
    .eq("workflow_version_id", workflowVersionId)
    .in("task", dependsOn);
  if (!steps?.length) return [];

  const stepIds = steps.map((s) => s.id as string);
  const { data: tasks } = await sb
    .from("work_task")
    .select("workflow_step_id, state")
    .eq("workflow_run_id", runId)
    .in("workflow_step_id", stepIds);

  const closedStepIds = new Set(
    (tasks ?? [])
      .filter((t) => t.state === "closed")
      .map((t) => t.workflow_step_id as string),
  );

  return steps
    .filter((s) => !closedStepIds.has(s.id as string))
    .sort((a, b) => (a.ord as number) - (b.ord as number))
    .map((s) => s.title as string);
}

/**
 * Everything stopping `taskId` from starting, freshly measured — never read off stale render-time
 * evidence, since this decides whether a write is allowed to happen, not what a card displays.
 *
 * Ad-hoc work (no `workflow_step`) has no gate at all — the same rule the old RPC had: it is
 * unplanned by definition, and requiring a Ready gate would mean nobody could ever record the
 * thing the process failed to anticipate.
 */
export async function unmetToStart(actor: Actor, taskId: string): Promise<Blocker[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: task } = await sb
    .from("work_task")
    .select(
      "id, workflow_run_id, workflow_step_id, workflow_step(task, depends_on, workflow_version_id)",
    )
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return [];

  const step = Array.isArray(task.workflow_step) ? task.workflow_step[0] : task.workflow_step;
  if (!step || !task.workflow_run_id) return [];

  const statuses = await measureTask(actor, taskId);
  const ready = statuses.filter((c) => c.kind === "ready");

  const waitingOn = await openDependencies(
    step.workflow_version_id as string,
    task.workflow_run_id as string,
    (step.depends_on as string[] | null) ?? [],
  );

  return blockersFrom(ready, waitingOn);
}
