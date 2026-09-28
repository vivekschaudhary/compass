import { supabaseAdmin, must } from "../../supabase";
import { emit, emitRefusal } from "../events";
import { mirrorState, moveFailed } from "../tracker";
import type { Actor } from "../actor";
import { evaluate } from "./registry";
import type { CriterionRow, CriterionStatus, NestedClose } from "./types";

/* ── reading the criteria that apply to a task ───────────────────────────── */

/**
 * A task's criteria: its own step's, plus the workflow-level ones.
 *
 * Workflow-level criteria (step_task null) are about the run as a whole and are shown separately —
 * a task card lists what that task must satisfy, never someone else's step. But the READY gate on
 * the workflow does apply before the first task may start, which is why they are returned together
 * and labelled rather than merged.
 */
export async function criteriaForTask(taskId: string): Promise<CriterionRow[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: task } = await sb
    .from("work_task")
    .select(
      "workflow_step_id, workflow_run!work_task_workflow_run_id_fkey(workflow_version_id)",
    )
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return [];

  const run = task.workflow_run as unknown as
    | { workflow_version_id: string }
    | { workflow_version_id: string }[]
    | null;
  const versionId = Array.isArray(run)
    ? run[0]?.workflow_version_id
    : run?.workflow_version_id;
  if (!versionId) return [];

  let stepTask: string | null = null;
  if (task.workflow_step_id) {
    const { data: step } = await sb
      .from("workflow_step")
      .select("task")
      .eq("id", task.workflow_step_id)
      .maybeSingle();
    stepTask = step?.task ?? null;
  }

  const { data } = await sb
    .from("criterion")
    .select(
      "id, kind, step_task, statement, subject_kind, subject_ref, operator, value",
    )
    .eq("workflow_version_id", versionId)
    .order("ord");

  return (data ?? [])
    .filter((c) => c.step_task === null || c.step_task === stepTask)
    .map((c) => ({
      id: c.id,
      kind: c.kind,
      stepTask: c.step_task,
      statement: c.statement,
      subjectKind: c.subject_kind,
      subjectRef: c.subject_ref,
      operator: c.operator,
      value: c.value,
    }));
}

/**
 * Evaluate every criterion for a task and RECORD the results.
 *
 * Measurements are written, not just returned — `measured_at` and `source` on a row are what make
 * "3 of 4" evidence rather than a claim, and what let the card say "as of four minutes ago"
 * instead of implying live truth. Unmeasurable criteria write nothing: the absence of a row IS
 * the unknown.
 */
export async function measureTask(
  actor: Actor,
  taskId: string,
): Promise<CriterionStatus[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const criteria = await criteriaForTask(taskId);
  const out: CriterionStatus[] = [];
  // What the log already believes. This runs on every page render, so emitting a line per criterion
  // per look would bury the record in polling noise — an audit log records CHANGES, not checks that
  // came back the same. Only a verdict that moved is news.
  const { data: before } = await sb
    .from("measurement")
    .select("criterion_id, satisfied")
    .eq("task_id", taskId);
  const previously = new Map(
    (before ?? []).map((m) => [
      m.criterion_id as string,
      m.satisfied as boolean,
    ]),
  );

  for (const c of criteria) {
    const verdict = await evaluate(actor, c, taskId);
    out.push({ ...c, verdict });
    const was = previously.get(c.id);

    if (verdict.state === "unmeasurable") {
      // Clear any stale measurement rather than leaving yesterday's answer standing.
      await sb
        .from("measurement")
        .delete()
        .eq("task_id", taskId)
        .eq("criterion_id", c.id);
      // Losing the ability to check something IS news — "we could no longer verify this" must
      // never read the same as "we never tried".
      if (was !== undefined) {
        await emit({
          engagementId: actor.engagementId,
          subjectType: "criterion",
          subjectId: c.id,
          verb: "criterion.unmeasurable",
          actorKind: "system",
          actorRoleCode: actor.roleCode,
          payload: {
            taskId,
            statement: c.statement,
            kind: c.kind,
            why: verdict.why,
            previously: was,
          },
        });
      }
      continue;
    }
    await sb.from("measurement").upsert(
      {
        task_id: taskId,
        criterion_id: c.id,
        satisfied: verdict.state === "satisfied",
        measured_at: new Date().toISOString(),
        source: verdict.source,
        detail: verdict.detail,
      },
      { onConflict: "task_id,criterion_id" },
    );

    const now = verdict.state === "satisfied";
    if (was !== now) {
      await emit({
        engagementId: actor.engagementId,
        subjectType: "criterion",
        subjectId: c.id,
        verb: now ? "criterion.met" : "criterion.unmet",
        actorKind: "system",
        actorRoleCode: actor.roleCode,
        payload: {
          taskId,
          statement: c.statement,
          kind: c.kind,
          source: verdict.source,
          detail: verdict.detail,
          previously: was ?? null,
        },
      });
    }
  }

  return out;
}

/**
 * Re-measure every row of a run that is still open.
 *
 * THE MEASUREMENT IS THE GATE, and it is only as current as the last thing that wrote it. Nothing
 * re-measured a row when the thing it waited on landed: the SOW was filed and published at 19:19,
 * and `Timeline & Milestones` went on showing "No document at sow" from a measurement taken at
 * 16:41 — a correct reading of a world that no longer existed. That is not cosmetic. `start_task`
 * refuses on `m.id is null or not m.satisfied`, so a stale unsatisfied row genuinely blocks work,
 * and the only cure was a person finding the `re-check` button on the queue.
 *
 * `storedStatusFor` stays read-only and a page render still writes nothing. The fix is to re-measure
 * on the EVENTS that can change a verdict — a row closing, a run opening — rather than on every
 * look.
 *
 * CLOSED ROWS ARE SKIPPED. Re-measuring one would delete the human attestations that closed it
 * (`measureTask` clears a measurement it can no longer evaluate), and a finished row would start
 * reading unfinished.
 */
export async function remeasureRun(
  actor: Actor,
  runId: string,
  depth = 0,
): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;

  const open = must(
    "read the run's rows to re-measure them",
    await sb
      .from("work_task")
      .select("id, state")
      .eq("workflow_run_id", runId)
      .neq("state", "closed"),
  );

  for (const t of open ?? []) {
    await measureTask(actor, t.id as string);

    // THE RETRY. Measuring is not the end of the story for a nesting row: the database already
    // tried to close it when its child run closed, and could only have failed. See
    // `closeNestingRowIfSatisfied` — the attempt happens inside the child's transaction, before the
    // measurements this very loop is writing exist.
    const closed = await closeNestingRowIfSatisfied(actor, t.id as string);
    if (!closed.closed) continue;

    // One hop up, and only up. Closing this row may have closed the run that holds it, which fires
    // the same trigger on ITS parent with the same stale measurements — so the cascade has to be
    // walked here or it stops one level short.
    if (depth >= MAX_CASCADE) {
      // A halt with a name on it. Deeper than this and something is wrong with the shape of the
      // nesting, not with the timing, and a silent stop would leave a row open with no record of
      // why nobody tried to close it.
      await emitRefusal({
        engagementId: actor.engagementId,
        subjectType: "task",
        subjectId: t.id as string,
        verb: "task.close_cascade_capped",
        actorRoleCode: actor.roleCode,
        reason: `Stopped walking up after ${MAX_CASCADE} levels of nesting.`,
        payload: { runId, depth },
      });
      continue;
    }
    const up = await parentRunOf(runId);
    if (up) await remeasureRun(actor, up, depth + 1);
  }
}

/** How far a close may cascade upward. Nesting is two or three deep; ten is a cycle, not a graph. */
const MAX_CASCADE = 5;

/**
 * Close a row that a finished child run has satisfied — the retry the database cannot do itself.
 *
 * `close_parent_task_when_child_run_closes` calls `close_task` from inside the CHILD's transaction,
 * and `close_task` does not measure anything: it reads `measurement` rows. Those are written here,
 * in Node, by connectors that talk to Confluence and Jira — and they run AFTER the close returns.
 * So the trigger can only ever see measurements taken before the child closed, which for a row
 * whose Done gate depends on what the child produced is guaranteed to be the stale answer. On the
 * live engagement the trigger refused at 18:57:55 with "timeline is published (not met: No document
 * at timeline)" and the re-measure wrote "timeline is published at v1.0" five seconds later. The
 * trigger's attempt is the optimistic first try; this is the one that can actually see the world.
 *
 * ONLY NESTING ROWS. An ordinary row's Done gate going green is not permission to close it — that
 * is the HITL gate, and a person presses it. A nesting row is different in kind: it has no draft of
 * its own and no reviewer, because every row of its child run carried its own gate and its own
 * approval. Nobody is being bypassed; there was never anybody there.
 *
 * Returns whether it closed anything — so `remeasureRun` knows whether to look further up, and so
 * the button a person presses can say what stopped it rather than going quiet.
 */
export async function closeNestingRowIfSatisfied(
  actor: Actor,
  taskId: string,
): Promise<NestedClose> {
  const no = (why: string): NestedClose => ({ closed: false, why });

  const sb = supabaseAdmin();
  if (!sb) return no("Supabase is not configured.");

  const { data: task } = await sb
    .from("work_task")
    .select("id, state, role_code, workflow_step_id, workflow_run_id")
    .eq("id", taskId)
    .eq("engagement_id", actor.engagementId)
    .maybeSingle();
  if (!task) return no("That task is not in your engagement.");
  if (task.state === "closed") return no("That row is already closed.");
  // `idle` is not a candidate: `close_task` refuses a row that never started, and rightly — there
  // is nothing to approve. Only a row someone opened a run from can be finished by one closing.
  if (task.state === "idle")
    return no("That row has not been started, so there is nothing to finish.");

  if (!task.workflow_step_id)
    return no("That row is ad-hoc — it nests no workflow.");
  const { data: step } = await sb
    .from("workflow_step")
    .select("nests_workflow_code")
    .eq("id", task.workflow_step_id)
    .maybeSingle();
  const nests = (step?.nests_workflow_code as string | null) ?? null;
  if (!nests)
    return no("That row is not satisfied by a nested workflow — approve it.");

  // The child run has to exist AND be finished. An aggregate over zero rows is the classic false
  // green: with no runs at all "every run has closed" is vacuously true, and this would close a
  // nesting row whose work had never been opened.
  const { data: runs } = await sb
    .from("workflow_run")
    .select("id, state")
    .eq("parent_task_id", taskId);
  const children = runs ?? [];
  if (!children.length) return no(`No ${nests} run has been opened yet.`);
  if (children.some((r) => r.state !== "closed"))
    return no(`The ${nests} run is still open.`);

  // Every Done criterion, measured and satisfied. Same set `close_task` will check — asking here
  // first is what keeps a doomed attempt out of the log and off the tracker.
  const done = (await criteriaForTask(taskId)).filter((c) => c.kind === "done");
  if (done.length) {
    const { data: ms } = await sb
      .from("measurement")
      .select("criterion_id, satisfied")
      .eq("task_id", taskId);
    const met = new Set(
      (ms ?? [])
        .filter((m) => m.satisfied)
        .map((m) => m.criterion_id as string),
    );
    const unmet = done.filter((c) => !met.has(c.id));
    // Named, not counted. "2 criteria are not met" sends someone hunting for which two.
    if (unmet.length)
      return no(`Not done:\n  ${unmet.map((c) => c.statement).join("\n  ")}`);
  }

  // The board closes first, for the reason `approve` states: the tracker holds the status of
  // record, and closing here while Jira still reads In Progress gives two answers with no arbiter.
  const moved = await mirrorState(
    actor.engagementId,
    taskId,
    "closed",
    actor.roleCode,
  );
  if (moveFailed(moved)) {
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.close_blocked_by_tracker",
      actorRoleCode: actor.roleCode,
      reason: moved.note ?? "The tracker refused to close this.",
      payload: { ticket: moved.key ?? null, nests },
    });
    return no(moved.note ?? "The tracker refused to close this.");
  }

  const { error } = await sb.rpc("close_task", {
    p_task_id: taskId,
    p_actor: "system",
    p_actor_role: (task.role_code as string) ?? actor.roleCode,
  });
  if (error) {
    // The gate said no after the ticket moved. Put it back, exactly as `approve` does — the board
    // must not read Done for a row Compass will not close.
    if (moved.ok)
      await mirrorState(actor.engagementId, taskId, "hitl", actor.roleCode);
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.child_run_closed_gate_not_met",
      actorRoleCode: actor.roleCode,
      reason: error.message,
      payload: { nests, retried: true, ticketReturned: moved.ok },
    });
    return no(error.message);
  }

  // The verb the trigger uses when it succeeds. Same fact, later — and `actorKind: "system"` is the
  // honest part: `close_task` writes its own `task.closed` as a human because its actor kind is
  // hardcoded, and nobody pressed anything here.
  await emit({
    engagementId: actor.engagementId,
    subjectType: "task",
    subjectId: taskId,
    verb: "task.satisfied_by_child_run",
    actorKind: "system",
    actorRoleCode: actor.roleCode,
    payload: { nests, runs: children.map((r) => r.id), retried: true },
  });
  return { closed: true };
}

/**
 * The run that holds the task a nested run hangs off — one hop up, or null at the top.
 *
 * Two joins, not one: `workflow_run.parent_task_id` names a TASK, and what has to be re-measured is
 * that task's siblings as well as the task itself.
 */
export async function parentRunOf(runId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: run } = await sb
    .from("workflow_run")
    .select("parent_task_id")
    .eq("id", runId)
    .maybeSingle();
  if (!run?.parent_task_id) return null;

  const { data: parent } = await sb
    .from("work_task")
    .select("workflow_run_id")
    .eq("id", run.parent_task_id)
    .maybeSingle();
  return (parent?.workflow_run_id as string | null) ?? null;
}

/** Ready / Done, counted honestly. */
export function tally(statuses: CriterionStatus[], kind: "ready" | "done") {
  const mine = statuses.filter((s) => s.kind === kind);
  return {
    total: mine.length,
    satisfied: mine.filter((s) => s.verdict.state === "satisfied").length,
    unsatisfied: mine.filter((s) => s.verdict.state === "unsatisfied").length,
    unmeasurable: mine.filter((s) => s.verdict.state === "unmeasurable").length,
    /** Only true when every one of them was actually checked and passed. */
    passes:
      mine.length > 0 && mine.every((s) => s.verdict.state === "satisfied"),
  };
}
