import { supabaseAdmin } from "../../supabase";
import type { Actor } from "../actor";
import { sortByStep } from "../steps";
import { remeasureRun } from "../gates";
import { mirrorNested, mirrorState } from "../tracker";
import { startTask } from "../tasks";
import { mirrorAndCompose } from "./lifecycle";
import type { BoardResult, FanOutResult } from "./types";

/**
 * Open the child run for a row that nests a workflow, and put it on the board.
 *
 * The row is done when that run closes — the trigger from 034 does that half. This is the other
 * half: someone starting the row.
 *
 * THE MIRROR RESULT IS RETURNED, NOT DROPPED. It used to return only `{ ok, runId }`, so a nested
 * run that could not reach Jira looked exactly like one that had — the same failure `initiatePhase`
 * already returns `mirrored` to avoid.
 *
 * THE PARENT STORY MOVES. Every other `mirrorState` call sits on the agent path or the close path,
 * and a nesting row runs no agent — so its story was created To Do and stayed there for the whole
 * nested run. A week of work under a card nobody saw move reads as a stalled row, not a busy one.
 */
export async function openNested(
  actor: Actor,
  taskId: string,
  subjectRef: string | null = null,
): Promise<
  | {
      ok: true;
      runId: string;
      mirrored: BoardResult;
      startedTaskId: string | null;
    }
  | { ok: false; error: string }
> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const { data: task } = await sb
    .from("work_task")
    .select("id, workflow_step_id")
    .eq("id", taskId)
    .eq("engagement_id", actor.engagementId)
    .maybeSingle();
  if (!task)
    return { ok: false, error: "That task is not in your engagement." };

  const { data: runId, error } = await sb.rpc("open_nested_run", {
    p_task_id: taskId,
    p_actor: actor.holder ?? actor.roleCode,
    p_actor_role: actor.roleCode,
    p_subject_ref: subjectRef,
  });
  if (error) return { ok: false, error: error.message };

  const mirrored = await mirrorAndCompose(
    actor.engagementId,
    runId as string,
    actor.roleCode,
    () => mirrorNested(actor.engagementId, runId as string, actor.roleCode),
    { taskLevel: "subtask" },
  );
  // The row itself is now in progress: its work is the child run. Reported through `mirrored`
  // rather than failing the open — the run exists whether or not the board heard about it.
  const moved = await mirrorState(
    actor.engagementId,
    taskId,
    "running",
    actor.roleCode,
  );
  if (
    !moved.ok &&
    moved.reason !== "no-tracker" &&
    moved.reason !== "no-ticket"
  ) {
    mirrored.problems.push(
      `The parent row's ticket did not move: ${moved.note}`,
    );
  }

  // Measure the child's rows, exactly as `initiatePhase` does for a phase's. Without it a nested
  // run opens with no measurements at all, and `start_task` refuses its first row as "Not ready"
  // even when the document it reads has been published for hours — the child-run half of the
  // staleness `remeasureRun` exists for.
  await remeasureRun(actor, runId as string);

  // Same role, continuing its own work, gets the same promise a plain task's click already makes:
  // the click IS the start. `start_task` carries no role check of its own — nothing in the
  // database stops starting a row owned by someone else — so this only fires when the child run's
  // first task belongs to the SAME role that just opened it. A different role's task is left
  // `idle` in ITS OWN queue, same as `initiatePhase` leaves every phase row idle for its owner —
  // starting someone else's task on their behalf, even though nothing would stop it, is not this
  // click's to do.
  //
  // Best-effort: the Ready gate can still refuse right after `remeasureRun`, and that must not
  // turn a successful open into a failure — the run DID open, only its first row could not start
  // yet. Left idle, exactly as if this block did not run at all.
  //
  // ORDERED BY STEP, NOT `created_at`. `open_workflow_run` now creates every step in one loop, so
  // their `created_at` values are identical to the millisecond — the exact "a phase writes every
  // row in one transaction" trap this repo already learned from (see `steps.ts`). Before this
  // child runs only ever had one row, so the bug was latent; it stops being latent the moment a
  // nested workflow has more than one step.
  const { data: runTasks } = await sb
    .from("work_task")
    .select("id, role_code, workflow_step(ord)")
    .eq("workflow_run_id", runId as string);
  const firstTask = sortByStep(runTasks ?? [])[0] ?? null;
  // Reported back so the CALLER can decide whether there is somewhere better to send the person
  // than the parent row's own page — see `startedTaskId` on `FanOutResult`. `openNested` itself
  // only starts it; routing there is a decision the click handler makes, not this function.
  let startedTaskId: string | null = null;
  if (firstTask?.role_code === actor.roleCode) {
    const started = await startTask(actor, firstTask.id as string).catch(
      () => null,
    );
    if (started?.ok) startedTaskId = firstTask.id as string;
  }

  return { ok: true, runId: runId as string, mirrored, startedTaskId };
}

/**
 * Open the single child run a nesting row gets by default.
 *
 * Most nesting rows are this shape: `sprint-0.draft-features` opens one `feature` run, and every
 * feature lands in one `features` document. `subject: null` because there is nothing to key the run
 * on — the row and its child are 1:1.
 */
async function openNestedSingle(
  actor: Actor,
  taskId: string,
): Promise<FanOutResult> {
  const one = await openNested(actor, taskId);
  return one.ok
    ? {
        ok: true,
        runs: [
          {
            runId: one.runId,
            subject: null,
            mirrored: one.mirrored,
            startedTaskId: one.startedTaskId,
          },
        ],
      }
    : one;
}

/**
 * Open one child run per epic, for a nesting row whose nested workflow authors a per-epic document.
 * Epic technical design is the first of these — a design is authored per epic, as its own page,
 * reviewed and approved on its own.
 *
 * FANNING OUT OVER ZERO EPICS REFUSES. `for (const e of [])` completes, the row closes, and a
 * technical design phase that designed nothing looks exactly like one that designed everything.
 * That is the aggregate-over-no-rows failure this repo keeps re-learning, so it is an error.
 */
async function openNestedPerEpic(
  actor: Actor,
  taskId: string,
): Promise<FanOutResult> {
  const epics = await epicsOfRun(taskId);
  if (!epics.length) {
    return {
      ok: false,
      error:
        "This row opens one technical design per epic, and this run has no epics. " +
        "Nothing was opened — draft and approve the epics first.",
    };
  }

  const runs: {
    runId: string;
    subject: string | null;
    mirrored: BoardResult;
    startedTaskId: string | null;
  }[] = [];
  for (const epic of epics) {
    const child = await openNested(actor, taskId, epic.ref);
    // One epic failing does not silently drop the rest: the others still open, and the failure is
    // returned rather than logged nowhere. A partial fan-out is honest; a quiet one is not.
    if (!child.ok) return { ok: false, error: `${epic.ref}: ${child.error}` };
    runs.push({
      runId: child.runId,
      subject: epic.ref,
      mirrored: child.mirrored,
      startedTaskId: child.startedTaskId,
    });
  }
  return { ok: true, runs };
}

/**
 * Open the child run(s) for a nesting row — one, or one per epic.
 *
 * The only caller of `nestedIsPerEpic`. WHICH SHAPE APPLIES IS DERIVED, NOT CONFIGURED — a workflow
 * declares itself per-epic by producing a per-epic path (`03-architecture/epic/{epic}`), which it
 * must do anyway or its documents would collide. A separate flag saying the same thing is a second
 * source of truth, and the two would eventually disagree — one of them silently. This function is
 * a router over that derived answer, not a home for either procedure's own logic — see
 * `openNestedSingle`/`openNestedPerEpic` for what each shape actually does.
 */
export async function openNestedFanOut(
  actor: Actor,
  taskId: string,
): Promise<FanOutResult> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  return (await nestedIsPerEpic(taskId))
    ? openNestedPerEpic(actor, taskId)
    : openNestedSingle(actor, taskId);
}

/** Does the workflow this row nests author one document per epic? */
async function nestedIsPerEpic(taskId: string): Promise<boolean> {
  const sb = supabaseAdmin();
  if (!sb) return false;

  const { data: task } = await sb
    .from("work_task")
    .select("org_id, engagement_id, workflow_step_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task?.workflow_step_id) return false;

  const { data: step } = await sb
    .from("workflow_step")
    .select("nests_workflow_code")
    .eq("id", task.workflow_step_id)
    .maybeSingle();
  const code = step?.nests_workflow_code as string | null;
  if (!code) return false;

  // The engagement's override wins over the org default, exactly as `open_workflow_run` resolves it
  // — reading the org copy here would answer for a workflow this run is not using.
  const { data: wf } = await sb
    .from("workflow")
    .select("id")
    .eq("org_id", task.org_id)
    .eq("code", code)
    .or(`engagement_id.eq.${task.engagement_id},engagement_id.is.null`)
    .order("engagement_id", { nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!wf) return false;

  const { data: ver } = await sb
    .from("workflow_version")
    .select("id")
    .eq("workflow_id", wf.id)
    .eq("status", "published")
    .maybeSingle();
  if (!ver) return false;

  const { data: steps } = await sb
    .from("workflow_step")
    .select("produces")
    .eq("workflow_version_id", ver.id);
  return (steps ?? []).some((s) =>
    (s.produces as string | null)?.includes("{epic}"),
  );
}

/** The epics drafted in this task's own run — what the fan-out opens a design for. */
async function epicsOfRun(
  taskId: string,
): Promise<{ ref: string; key: string | null }[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: task } = await sb
    .from("work_task")
    .select("workflow_run_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task?.workflow_run_id) return [];

  // Every task of this run, because the epics belong to whichever row drafted them — this row only
  // knows it comes after.
  const { data: siblings } = await sb
    .from("work_task")
    .select("id")
    .eq("workflow_run_id", task.workflow_run_id);
  const ids = (siblings ?? []).map((s) => s.id as string);
  if (!ids.length) return [];

  const { data: items } = await sb
    .from("backlog_item")
    .select("ref, ticket_key")
    .in("task_id", ids)
    .eq("kind", "epic")
    .order("ord");
  return (items ?? []).map((i) => ({
    ref: i.ref as string,
    key: (i.ticket_key as string | null) ?? null,
  }));
}
