// Initiating a phase, and working a row that nests a workflow.
//
// This replaces `materialiseBacklog`, which read the kickoff-backlog DOCUMENT and opened a workflow
// run per row. That was v1's `createSprint0` ported faithfully, and it was faithful to the wrong
// thing: it made every row a peer workflow, which is how one engagement ended up with nine runs
// holding six tasks. A row is a unit of work inside a phase, not a phase of its own.
//
// Two cases, and they are the whole surface:
//
//   initiatePhase   the delivery manager starts a phase — setup, sprint-0, sprint. Every row
//                   becomes a task in ONE run, up front, because a phase's rows are known when it
//                   begins and the point of a kickoff backlog is that nothing in it is a surprise.
//
//   openNested      a row whose dispatch is `workflow: <code>` opens a CHILD run when someone
//                   starts it. The child closes its parent task when it closes (migration 034).
//
// Both go through database routines. Nothing here inserts a task.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./actor";
import { orgIdFor, emit, emitRefusal } from "./events";
import { sortByStep } from "./steps";
import {
  measureTask,
  remeasureRun,
  storedStatusFor,
  evaluate,
  type CriterionRow,
} from "./gates";
import {
  mirrorPhase,
  mirrorNested,
  mirrorState,
  type Mirrored,
} from "./tracker";
import { composeTicketBodies, type Composed } from "./ticket-body";
import { startTask } from "./tasks";

/**
 * The board, in both halves: the tickets exist, and they say something.
 *
 * Two calls rather than one because they fail differently and must be reported apart. Mirroring is
 * structural — no epic means no board at all. Composition is editorial — a ticket whose body did not
 * compose is on the board and readable, just still carrying its placeholder. Collapsing them into
 * one "problems" list would make a model outage look like a Jira outage.
 */
export type BoardResult = Mirrored & { composed?: Composed };

export type Initiated =
  | {
      ok: true;
      runId: string;
      tasks: { id: string; title: string; role: string }[];
      mirrored?: BoardResult;
    }
  | { ok: false; error: string };

/**
 * Mirror, then compose — the one call path both `initiatePhase` (epic + stories) and `openNested`
 * (a nested run's own sub-tasks) go through, rather than two copies that drift the next time
 * either changes.
 *
 * Composition runs after, never during: opening a phase or a nested run must not wait on a model,
 * and one whose bodies could not be written still has its board. Its failure is returned, never
 * thrown — the work happened whether or not a ticket reads well.
 */
async function mirrorAndCompose(
  engagementId: string,
  runId: string,
  roleCode: string,
  mirror: () => Promise<Mirrored>,
  composeOpts: Parameters<typeof composeTicketBodies>[3] = {},
): Promise<BoardResult> {
  const mirrored = await mirror();
  // Nothing on the board is nothing to write on. Composing here would spend a model call producing
  // text with nowhere to go.
  if (!mirrored.epic) return mirrored;

  try {
    return {
      ...mirrored,
      composed: await composeTicketBodies(engagementId, runId, roleCode, composeOpts),
    };
  } catch (e) {
    return {
      ...mirrored,
      composed: {
        written: [],
        expected: 0,
        reason: "no-host",
        problems: [
          `Composing ticket bodies failed: ${e instanceof Error ? e.message : String(e)}`,
        ],
      },
    };
  }
}

async function putOnBoard(
  engagementId: string,
  runId: string,
  roleCode: string,
): Promise<BoardResult> {
  return mirrorAndCompose(engagementId, runId, roleCode, () => mirrorPhase(engagementId, runId, roleCode));
}

/**
 * Start a phase.
 *
 * Refuses when the phase's entry gate is not satisfied — and says which criterion, because "not
 * ready" with no reason is the thing this product exists to replace. Idempotent: a phase already
 * open on this engagement is returned rather than duplicated.
 */
export async function initiatePhase(
  actor: Actor,
  workflowCode: string,
  /**
   * Which reporting bucket this run belongs to (discovery/build/hypercare/support, or whatever an
   * org's reference data ends up naming) — a label for status/dashboard rollups, written onto the
   * run once it opens. Only meaningful for a repeating phase like `sprint`; `setup` and `discovery`
   * are already unambiguous from `workflowCode` alone, so callers pass this for `sprint` and omit
   * it elsewhere. Applied only when a NEW run is created below — a click that finds an already-open
   * run (the idempotent branch just above) does not retroactively reclassify it.
   */
  phaseTag?: string,
): Promise<Initiated> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const orgId = await orgIdFor(actor.engagementId);
  const { data: wf } = await sb
    .from("workflow")
    .select("id, label")
    .eq("org_id", orgId)
    .eq("code", workflowCode)
    .eq("enabled", true)
    .maybeSingle();
  if (!wf)
    return {
      ok: false,
      error: `No workflow '${workflowCode}' in this organisation.`,
    };

  const blocked = await unmetEntryGate(actor, wf.id);
  if (blocked.length) {
    // A phase that could not start is the most useful record this product keeps: it is where the
    // process is actually stuck, and how long it stayed there. Written before returning, because
    // returning is the only place it can be written.
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "workflow",
      subjectId: wf.id,
      verb: "phase.refused",
      actorRoleCode: actor.roleCode,
      actorUserId: actor.holder ?? null,
      reason: blocked.join(" · "),
      payload: { workflow: workflowCode, unmet: blocked },
    });
    return {
      ok: false,
      error: `${wf.label} is not ready:\n  ` + blocked.join("\n  "),
    };
  }

  const { data: open } = await sb
    .from("workflow_run")
    .select("id")
    .eq("engagement_id", actor.engagementId)
    .eq("workflow_id", wf.id)
    .eq("state", "open")
    .is("parent_task_id", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log(" in InitiatePhase check open runs ", open);

  if (open) {
    const tasks = await tasksOfRun(open.id);

    const mirrored = await putOnBoard(
      actor.engagementId,
      open.id,
      actor.roleCode,
    );
    return { ok: true, runId: open.id, tasks, mirrored };
  }

  // `open_workflow_run` now materializes every one of the workflow's steps, not just the first —
  // see `20260924220000_open_workflow_run_all_steps.sql`. `open_phase_run` was a thin wrapper doing
  // exactly that for a phase specifically; it is gone, and this is the same call every other opener
  // (`open_nested_run`) already makes.
  const { data: runId, error } = await sb.rpc("open_workflow_run", {
    p_org_id: orgId,
    p_engagement_id: actor.engagementId,
    p_workflow_code: workflowCode,
    p_actor: actor.holder ?? actor.roleCode,
    p_actor_role: actor.roleCode,
  });
  if (error) {
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "workflow",
      subjectId: wf.id,
      verb: "phase.refused",
      actorRoleCode: actor.roleCode,
      actorUserId: actor.holder ?? null,
      reason: error.message,
      payload: { workflow: workflowCode, at: "open" },
    });
    return { ok: false, error: error.message };
  }

  if (phaseTag) {
    await sb.from("workflow_run").update({ phase_tag: phaseTag }).eq("id", runId as string);
  }

  const tasks = await tasksOfRun(runId as string);

  await emit({
    engagementId: actor.engagementId,
    subjectType: "workflow_run",
    subjectId: runId as string,
    verb: "phase.initiated",
    actorKind: "human",
    actorRoleCode: actor.roleCode,
    actorUserId: actor.holder ?? null,
    payload: { workflow: workflowCode, rows: tasks.length, phaseTag: phaseTag ?? null },
  });

  for (const t of tasks) {
    const statuses = await measureTask(actor, t.id);

    const done = statuses.filter((s) => s.kind === "done");
    const machine = await isMachineStep(t.id);
    if (
      machine &&
      done.length > 0 &&
      done.every((s) => s.verdict.state === "satisfied")
    ) {
      const who = actor.holder ?? actor.roleCode;
      // The SAME function a human's own Start click calls — not the raw RPC. It carries the
      // Ready/depends_on gate (see `start-gate.ts`) and its own refusal emission, so a machine row
      // auto-started at phase-open time is held to the same standard a person starting it would be,
      // and there is exactly one place in the codebase that calls `start_task`.
      // A refusal here used to fail in silence — the row just sat idle with no explanation
      // anywhere. `startTask` now emits that refusal itself, so there is nothing further to record
      // on this branch; only a successful start goes on to close.
      const started = await startTask(actor, t.id);
      if (started.ok) {
        const closed = await sb.rpc("close_task", {
          p_task_id: t.id,
          p_actor: who,
          p_actor_role: actor.roleCode,
        });
        if (closed.error) {
          await emitRefusal({
            engagementId: actor.engagementId,
            subjectType: "task",
            subjectId: t.id,
            verb: "task.close_refused",
            actorRoleCode: actor.roleCode,
            actorUserId: who,
            reason: closed.error.message,
            payload: { title: t.title, at: "phase-open machine row" },
          });
        }
      }
    }
  }

  // The board, last: OPENING a phase must not cost anything to a Jira outage — the rows exist
  // locally and the tickets can be created on the next attempt. (Closing is the opposite; the
  // tracker holds the status of record there, so `approve` moves the ticket before it closes the
  // task. See gates.ts.) Problems are returned, never thrown.
  //
  // Machine rows above closed with no ticket yet, which is why they close locally without the
  // board: mirrorPhase creates their story and moves it to match, a few lines from here.
  const mirrored = await putOnBoard(
    actor.engagementId,
    runId as string,
    actor.roleCode,
  );

  return { ok: true, runId: runId as string, tasks, mirrored };
}

/**
 * Put an already-open phase on the board.
 *
 * The repair path, and the only thing that can fix a run whose tickets were never created. Separate
 * from `initiatePhase` because the caller is someone looking at an open phase, not someone starting
 * one — and because a button whose whole job is "try the board again" should not be able to open a
 * phase as a side effect.
 *
 * The scope check is the point of this living here rather than in the action: `mirrorPhase` takes a
 * run id and would happily mirror another engagement's run.
 */
export async function remirrorPhase(
  actor: Actor,
  runId: string,
): Promise<{ ok: true; mirrored: Mirrored } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const { data: run } = await sb
    .from("workflow_run")
    .select("id")
    .eq("id", runId)
    .eq("engagement_id", actor.engagementId)
    .maybeSingle();
  if (!run)
    return { ok: false, error: "That phase is not in your engagement." };

  const mirrored = await putOnBoard(actor.engagementId, runId, actor.roleCode);
  return { ok: true, mirrored };
}

async function tasksOfRun(runId: string) {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data } = await sb
    .from("work_task")
    .select("id, title, role_code, workflow_step_id, workflow_step(ord)")
    .eq("workflow_run_id", runId);
  return sortByStep(data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    role: t.role_code,
  }));
}

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

type FanOutResult =
  | {
      ok: true;
      runs: {
        runId: string;
        subject: string | null;
        mirrored: BoardResult;
        /** Set when this run's first task was auto-started for the actor who opened it. */
        startedTaskId: string | null;
      }[];
    }
  | { ok: false; error: string };

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

// ── inline fan-out: ported from 4b023d40 (materialize-scaffold-repos) ─────────────────────

type FanOutSubject = { ref: string };

/**
 * The published version of the workflow a task's row nests, resolved the engagement-override-wins
 * way `open_workflow_run` does. Shared by `nestedFanOutKind` and `materializeInlinePerSubject` so
 * there is one place this resolution happens, not two that could disagree on which version a run
 * is actually using.
 */
async function resolveNestedVersion(taskId: string): Promise<{
  orgId: string;
  engagementId: string;
  runId: string | null;
  code: string;
  versionId: string;
  ownerRoleCode: string | null;
  workstreamCode: string | null;
} | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: task } = await sb
    .from("work_task")
    .select("org_id, engagement_id, workflow_run_id, workflow_step_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task?.workflow_step_id) return null;

  const { data: step } = await sb
    .from("workflow_step")
    .select("nests_workflow_code")
    .eq("id", task.workflow_step_id)
    .maybeSingle();
  const code = step?.nests_workflow_code as string | null;
  if (!code) return null;

  // The engagement's override wins over the org default — reading the org copy here would answer
  // for a workflow this run is not using.
  const { data: wf } = await sb
    .from("workflow")
    .select("id, owner_role_code, workstream_code")
    .eq("org_id", task.org_id)
    .eq("code", code)
    .or(`engagement_id.eq.${task.engagement_id},engagement_id.is.null`)
    .order("engagement_id", { nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!wf) return null;

  const { data: ver } = await sb
    .from("workflow_version")
    .select("id")
    .eq("workflow_id", wf.id)
    .eq("status", "published")
    .maybeSingle();
  if (!ver) return null;

  return {
    orgId: task.org_id as string,
    engagementId: task.engagement_id as string,
    runId: (task.workflow_run_id as string | null) ?? null,
    code,
    versionId: ver.id as string,
    ownerRoleCode: (wf.owner_role_code as string | null) ?? null,
    workstreamCode: (wf.workstream_code as string | null) ?? null,
  };
}


/**
 * Copy the template workflow's criteria into the PARENT run's own version, once per step_task that
 * does not already have a row there. Idempotent — safe to call on every materialize, including a
 * retry.
 *
 * Why a copy, not a second lookup path: `criteriaForTask` (`gates/measure.ts`) resolves criteria by
 * the RUN's `workflow_version_id` plus the step's `task` name — every task in the system is read
 * this way. A materialized task sits in the parent run but keeps the TEMPLATE's own
 * `workflow_step_id`, so without this copy its criteria would be registered under a version
 * `criteriaForTask` never looks at, and every Ready/Done gate on it would silently find nothing.
 * Copying the rows keeps that one widely-used function completely unchanged — teaching it a second
 * lookup path risks every OTHER workflow's gates, not just this one's.
 */
async function copyCriteriaIfMissing(
  templateVersionId: string,
  parentVersionId: string,
  stepTasks: string[],
): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb || templateVersionId === parentVersionId || !stepTasks.length) return;

  const { data: existing } = await sb
    .from("criterion")
    .select("step_task")
    .eq("workflow_version_id", parentVersionId)
    .in("step_task", stepTasks);
  const have = new Set((existing ?? []).map((r) => r.step_task as string));

  const { data: template } = await sb
    .from("criterion")
    .select("kind, ord, statement, subject_kind, subject_ref, operator, value, step_task")
    .eq("workflow_version_id", templateVersionId)
    .in("step_task", stepTasks);

  const rows = (template ?? [])
    .filter((c) => c.step_task && !have.has(c.step_task as string))
    .map((c) => ({ ...c, workflow_version_id: parentVersionId }));
  if (rows.length) await sb.from("criterion").insert(rows);
}

/**
 * The `inline` fan-out mode — materialize a nested workflow's steps as plain tasks INSIDE the
 * calling run, once per subject, instead of opening a second-level nested run.
 *
 * See `FAN_OUT_KINDS`'s own comment for why: Jira's hierarchy caps at one level below an epic, and
 * `scaffold-repos` already sits one level nested under `sprint-0`'s `foundation-architecture` — a
 * second nested run per repo cannot be mirrored (`mirrorNested` correctly refuses it as "nested two
 * deep"). This stays flat instead: no second run, so no second nesting level, ever.
 *
 * IDEMPOTENT per (run, subject, step) — a retry or a second click does not clone a second copy of a
 * subject's pair, same discipline `open_nested_run`'s own idempotency gives the `nest` mode.
 */
async function materializeInlinePerSubject(
  actor: Actor,
  taskId: string,
  subjects: FanOutSubject[],
  emptyError: string,
): Promise<FanOutResult> {
  if (!subjects.length) return { ok: false, error: emptyError };

  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const resolved = await resolveNestedVersion(taskId);
  if (!resolved) return { ok: false, error: "This row's nested workflow could not be resolved." };
  if (!resolved.runId) return { ok: false, error: "This row has no run to materialize into." };
  const runId = resolved.runId;

  const { data: parentRun } = await sb
    .from("workflow_run")
    .select("id, workflow_version_id")
    .eq("id", runId)
    .maybeSingle();
  if (!parentRun) return { ok: false, error: "This row's own run could not be found." };

  const { data: templateSteps } = await sb
    .from("workflow_step")
    .select("id, ord, kind, role_code, task, title")
    .eq("workflow_version_id", resolved.versionId)
    .order("ord");
  if (!templateSteps?.length) {
    return { ok: false, error: `'${resolved.code}' has no steps to materialize.` };
  }

  await copyCriteriaIfMissing(
    resolved.versionId,
    parentRun.workflow_version_id as string,
    templateSteps.map((s) => s.task as string),
  );

  const subjectRefs = subjects.map((s) => s.ref);
  const { data: existing } = await sb
    .from("work_task")
    .select("subject_ref, workflow_step_id")
    .eq("workflow_run_id", runId)
    .in("subject_ref", subjectRefs);
  const already = new Set((existing ?? []).map((r) => `${r.subject_ref}:${r.workflow_step_id}`));

  const rows = subjects.flatMap((subject) =>
    templateSteps
      .filter((step) => !already.has(`${subject.ref}:${step.id}`))
      .map((step) => ({
        org_id: resolved.orgId,
        engagement_id: resolved.engagementId,
        workflow_run_id: runId,
        workflow_step_id: step.id as string,
        subject_ref: subject.ref,
        role_code: (step.role_code as string | null) ?? resolved.ownerRoleCode,
        kind: step.kind === "hitl" ? "hitl" : "agent",
        title: (step.title as string) || (step.task as string) || `Step ${step.ord}`,
        created_by: actor.holder ?? actor.roleCode,
        workstream_code: resolved.workstreamCode,
      })),
  );

  if (rows.length) {
    const { error } = await sb.from("work_task").insert(rows);
    if (error) return { ok: false, error: error.message };
  }

  // One mirror pass for the whole run, not one per subject — `mirrorNested` already skips any task
  // that already has a ticket and creates one for anything new, so a single call after every
  // subject's rows exist picks up exactly what this call added. Reused unchanged by every subject's
  // entry below: it is genuinely the same board result, since they all share one run.
  const mirrored = await mirrorAndCompose(
    resolved.engagementId,
    runId,
    actor.roleCode,
    () => mirrorNested(resolved.engagementId, runId, actor.roleCode),
    { taskLevel: "subtask" },
  );

  await remeasureRun(actor, runId);

  const { data: runTasks } = await sb
    .from("work_task")
    .select("id, subject_ref, role_code, workflow_step(ord)")
    .eq("workflow_run_id", runId)
    .in("subject_ref", subjectRefs);

  // Same rule `openNested` applies: auto-start a subject's first materialized task only when it
  // belongs to the SAME role that triggered the fan-out. A different role's task is left idle in
  // its own queue.
  const runs: { runId: string; subject: string | null; mirrored: BoardResult; startedTaskId: string | null }[] = [];
  for (const subject of subjects) {
    const forSubject = (runTasks ?? []).filter((t) => t.subject_ref === subject.ref);
    const first = sortByStep(forSubject)[0] ?? null;
    let startedTaskId: string | null = null;
    if (first?.role_code === actor.roleCode) {
      const started = await startTask(actor, first.id as string).catch(() => null);
      if (started?.ok) startedTaskId = first.id as string;
    }
    runs.push({ runId, subject: subject.ref, mirrored, startedTaskId });
  }

  return { ok: true, runs };
}

/**
 * Open one child run per repo registered on the engagement, for a nesting row whose nested workflow
 * writes into a repo. The subject is the repo's KEY — the closed list `repo` holds — and the run
 * later resolves its checkout from it, so a scaffold can never land in a repo nobody registered.
 *
 * FANNING OUT OVER ZERO REPOS REFUSES, for the same reason zero epics does: `for (const r of [])`
 * completes, the row closes, and a scaffold that scaffolded nothing looks exactly like one that
 * scaffolded everything.
 */
/**
 * The inline fan-out, callable from a materializer: the caller names the nesting row (the one whose
 * nested workflow is per-subject) and the subjects, and this materializes one task set per subject.
 */
export async function fanOutInline(
  actor: Actor,
  nestingTaskId: string,
  subjects: { ref: string }[],
): Promise<FanOutResult> {
  return materializeInlinePerSubject(actor, nestingTaskId, subjects, "No subjects to fan out over.");
}

async function openNestedPerRepo(
  actor: Actor,
  taskId: string,
): Promise<FanOutResult> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const { data: repos } = await sb
    .from("repo")
    .select("key")
    .eq("engagement_id", actor.engagementId)
    .order("ord");
  const keys = (repos ?? []).map((r) => r.key as string | null).filter((k): k is string => !!k);
  if (!keys.length) {
    return {
      ok: false,
      error:
        "This row scaffolds one repo at a time, and this engagement has no repos registered. " +
        "Nothing was opened — create the repos the scaffold plan lists and register each first.",
    };
  }

  // Inline, not nested: one run, one task pair per repo. A second nested run per repo cannot be
  // mirrored (Jira caps at one level below an epic), so the repos' steps are cloned into this run.
  return materializeInlinePerSubject(
    actor,
    taskId,
    keys.map((ref) => ({ ref })),
    "This row scaffolds one repo at a time, and this engagement has no repos registered. " +
      "Nothing was opened — create the repos the scaffold plan lists and register each first.",
  );
}

/**
 * Open the child run(s) for a nesting row — one, one per epic, or one per repo.
 *
 * The only caller of `nestedFanOutKind`. WHICH SHAPE APPLIES IS DERIVED, NOT CONFIGURED — a workflow
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

  const kind = await nestedFanOutKind(taskId);
  return kind === "epic"
    ? openNestedPerEpic(actor, taskId)
    : kind === "repo"
      ? openNestedPerRepo(actor, taskId)
      : openNestedSingle(actor, taskId);
}

/**
 * What the workflow this row nests is per — `epic`, `repo`, or neither.
 *
 * Derived from the SUBJECT TOKEN its steps produce, so one source says both where a document goes
 * and how many runs there are. `{repo}` is as deliberate as `{epic}`: a path that did not name its
 * repo would put every repo's scaffold at one address.
 */
async function nestedFanOutKind(taskId: string): Promise<"epic" | "repo" | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: task } = await sb
    .from("work_task")
    .select("org_id, engagement_id, workflow_step_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task?.workflow_step_id) return null;

  const { data: step } = await sb
    .from("workflow_step")
    .select("nests_workflow_code")
    .eq("id", task.workflow_step_id)
    .maybeSingle();
  const code = step?.nests_workflow_code as string | null;
  if (!code) return null;

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
  if (!wf) return null;

  const { data: ver } = await sb
    .from("workflow_version")
    .select("id")
    .eq("workflow_id", wf.id)
    .eq("status", "published")
    .maybeSingle();
  if (!ver) return null;

  const { data: steps } = await sb
    .from("workflow_step")
    .select("produces")
    .eq("workflow_version_id", ver.id);
  const produced = (steps ?? []).map((s) => (s.produces as string | null) ?? "");
  if (produced.some((p) => p.includes("{epic}"))) return "epic";
  if (produced.some((p) => p.includes("{repo}"))) return "repo";
  return null;
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

/** Is this task's row a machine check — something measured rather than performed? */
async function isMachineStep(taskId: string): Promise<boolean> {
  const sb = supabaseAdmin();
  if (!sb) return false;
  const { data: task } = await sb
    .from("work_task")
    .select("workflow_step_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task?.workflow_step_id) return false;
  const { data: step } = await sb
    .from("workflow_step")
    .select("kind")
    .eq("id", task.workflow_step_id)
    .maybeSingle();
  return step?.kind === "machine";
}

/** Does this task's row nest a workflow? The queue needs to know — it changes what the button does. */
export async function nestedWorkflowOf(taskId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data: task } = await sb
    .from("work_task")
    .select("workflow_step_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task?.workflow_step_id) return null;
  const { data: step } = await sb
    .from("workflow_step")
    .select("nests_workflow_code")
    .eq("id", task.workflow_step_id)
    .maybeSingle();
  return step?.nests_workflow_code ?? null;
}

/**
 * The child runs a nesting row has opened, and the rows inside each.
 *
 * `nestedWorkflowOf` says the row is satisfied by a workflow; this says what happened when someone
 * started it. Both are needed by the same surface, because "you started it and these five rows
 * opened" and "you have not started it yet" are different screens, and until now the job page
 * showed neither — it offered a Run button that could only ever be refused.
 *
 * `evaluateNested` already makes the run half of this query to decide whether the row's gate is
 * met. This widens it to carry the tasks, because a person needs to SEE the work, not be told a
 * count of it. The gate stays the authority on whether the row is done; this is for reading.
 *
 * Ordered by `ord`, the same order the child run's own queue uses, so the list here and the list
 * there cannot disagree about which row comes first.
 */
export async function childRunsOf(
  actor: Actor,
  taskId: string,
): Promise<
  {
    runId: string;
    state: string;
    subject: string | null;
    tasks: {
      id: string;
      title: string;
      roleCode: string;
      state: string;
      ticketKey: string | null;
    }[];
  }[]
> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: runs, error: runsError } = await sb
    .from("workflow_run")
    .select("id, state, subject_key, opened_at")
    .eq("engagement_id", actor.engagementId)
    .eq("parent_task_id", taskId)
    .order("opened_at");
  if (runsError) throw new Error(`read child runs: ${runsError.message}`);
  if (!runs?.length) return [];

  // One query for every child's rows rather than one per run — a fan-out opens one run per epic,
  // and a per-run query would grow with the backlog.
  //
  // `ord` lives on `workflow_step`, not `work_task` — there is no such column here to select or
  // order by directly. Embedding the step (the same to-one join `tasksFor`'s own SELECT already
  // uses) and sorting on the embedded value is the fix; selecting a nonexistent column failed the
  // whole query, and `tasks ?? []` below turned that failure into a silent "no rows", which is what
  // made every open nesting run report itself as empty.
  const { data: tasks, error: tasksError } = await sb
    .from("work_task")
    .select(
      "id, title, role_code, state, ticket_key, workflow_run_id, workflow_step(ord)",
    )
    .in(
      "workflow_run_id",
      runs.map((r) => r.id as string),
    );
  if (tasksError)
    throw new Error(`read child run tasks: ${tasksError.message}`);
  const ordOf = (t: {
    workflow_step: { ord: number | null }[] | { ord: number | null } | null;
  }) => {
    const step = Array.isArray(t.workflow_step)
      ? t.workflow_step[0]
      : t.workflow_step;
    return step?.ord ?? 0;
  };
  tasks?.sort((a, b) => ordOf(a) - ordOf(b));

  return runs.map((r) => ({
    runId: r.id as string,
    state: r.state as string,
    subject: (r.subject_key as string | null) ?? null,
    tasks: (tasks ?? [])
      .filter((t) => t.workflow_run_id === r.id)
      .map((t) => ({
        id: t.id as string,
        title: t.title as string,
        roleCode: t.role_code as string,
        state: t.state as string,
        ticketKey: (t.ticket_key as string | null) ?? null,
      })),
  }));
}

/**
 * Which phases exist for this engagement, and whether each has a run.
 *
 * It does NOT evaluate entry gates — `available` means "no run yet", not "ready to start". The
 * gate is checked by `initiatePhase`, which refuses and names the unmet criterion. Saying so here
 * because the docstring originally claimed otherwise, and a caller trusting it would render a
 * button as ready that is not.
 */
export async function phasesFor(actor: Actor): Promise<
  {
    code: string;
    label: string;
    state: "open" | "closed" | "available";
    runId: string | null;
    onBoard: boolean | null;
  }[]
> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const orgId = await orgIdFor(actor.engagementId);

  const { data: wfs } = await sb
    .from("workflow")
    .select("id, code, label, repeatable")
    .eq("org_id", orgId)
    .eq("owner_role_code", actor.roleCode)
    .eq("enabled", true);

  const nested = await nestedByOpenRun(actor.engagementId);

  const { data: runs } = await sb
    .from("workflow_run")
    .select("id, workflow_id, state, ticket_key, opened_at")
    .eq("engagement_id", actor.engagementId)
    .is("parent_task_id", null)
    .order("opened_at", { ascending: false });

  // The LATEST run per workflow. A repeating phase has many, and a Map built from an unordered list
  // would show whichever the database happened to return — "closed" over a sprint that is actually
  // in flight, or the reverse. Ordered newest-first above, so the first write wins.
  type Run = NonNullable<typeof runs>[number];
  const runOf = new Map<string, Run>();
  for (const r of runs ?? []) {
    if (!runOf.has(r.workflow_id as string))
      runOf.set(r.workflow_id as string, r);
  }

  // One query for every run's ticketless tasks rather than one per phase.
  const { data: unticketed } = await sb
    .from("work_task")
    .select("workflow_run_id")
    .eq("engagement_id", actor.engagementId)
    .is("ticket_key", null);

  const missing = new Set(
    (unticketed ?? []).map((t) => t.workflow_run_id as string),
  );

  return (wfs ?? [])
    .filter((w) => {
      const hidden = nested.has(w.code as string);
      return !hidden || Boolean(runOf.get(w.id));
    })
    .map((w) => {
      const run = runOf.get(w.id);
      return {
        code: w.code,
        label: w.label,

        state: run
          ? run.state === "closed"
            ? w.repeatable
              ? ("available" as const)
              : ("closed" as const)
            : ("open" as const)
          : ("available" as const),
        runId: run?.id ?? null,
        onBoard: run ? Boolean(run.ticket_key) && !missing.has(run.id) : null,
      };
    });
}

/**
 * Workflow codes that a currently open run's steps nest.
 *
 * Derived from the steps rather than a column on `workflow` or a list of names here: nesting is
 * already stated once, in `workflow_step.nests_workflow_code`, and a second place saying the same
 * thing is a second thing to keep true. This repo has made the carry-the-literal mistake before.
 *
 * FAILS OPEN, deliberately. An unreadable step table yields an empty set and the phase list is
 * whatever it was before — offering too much, which a person can refuse, rather than hiding a
 * phase with no way to find out why. The direction is chosen; it is not an accident.
 */
async function nestedByOpenRun(engagementId: string): Promise<Set<string>> {
  const sb = supabaseAdmin();
  if (!sb) return new Set();

  const { data: runs } = await sb
    .from("workflow_run")
    .select("workflow_version_id")
    .eq("engagement_id", engagementId)
    .neq("state", "closed");
  const versions = [
    ...new Set(
      (runs ?? []).map((r) => r.workflow_version_id as string).filter(Boolean),
    ),
  ];
  if (!versions.length) return new Set();

  const { data: steps } = await sb
    .from("workflow_step")
    .select("nests_workflow_code")
    .in("workflow_version_id", versions)
    .not("nests_workflow_code", "is", null);

  return new Set(
    (steps ?? []).map((s) => s.nests_workflow_code as string).filter(Boolean),
  );
}

export { storedStatusFor };

/**
 * The phase's workflow-level Ready criteria that are not satisfied.
 *
 * Three states, as everywhere: satisfied passes, unsatisfied blocks, and NOT-YET-MEASURABLE blocks
 * too — with a different sentence. "Could not check" must never open a gate, and it must never be
 * reported as though it failed either.
 */
async function unmetEntryGate(
  actor: Actor,
  workflowId: string,
): Promise<string[]> {
  const sb = supabaseAdmin();
  if (!sb) return ["Supabase is not configured."];

  const { data: ver } = await sb
    .from("workflow_version")
    .select("id")
    .eq("workflow_id", workflowId)
    .eq("status", "published")
    .maybeSingle();
  if (!ver) return ["That workflow has no published version."];

  const { data: rows } = await sb
    .from("criterion")
    .select(
      "id, kind, step_task, statement, subject_kind, subject_ref, operator, value",
    )
    .eq("workflow_version_id", ver.id)
    .eq("kind", "ready")
    .is("step_task", null);

  const out: string[] = [];
  for (const r of rows ?? []) {
    const c: CriterionRow = {
      id: r.id,
      kind: "ready",
      stepTask: null,
      statement: r.statement ?? "",
      subjectKind: r.subject_kind,
      subjectRef: r.subject_ref,
      operator: r.operator,
      value: r.value,
    };
    const v = await evaluate(actor, c, null);
    if (v.state === "satisfied") continue;
    const label = c.statement || `${c.subjectKind} ${c.subjectRef}`;
    out.push(
      v.state === "unmeasurable"
        ? `${label} — could not be checked: ${"why" in v ? v.why : "no reason recorded"}`
        : `${label} — not satisfied`,
    );
  }
  return out;
}
