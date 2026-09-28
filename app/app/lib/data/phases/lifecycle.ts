import { supabaseAdmin } from "../../supabase";
import type { Actor } from "../actor";
import { orgIdFor, emit, emitRefusal } from "../events";
import { sortByStep } from "../steps";
import { measureTask, evaluate, type CriterionRow } from "../gates";
import { mirrorPhase, type Mirrored } from "../tracker";
import { composeTicketBodies } from "../ticket-body";
import { startTask } from "../tasks";
import type { BoardResult, Initiated } from "./types";

/**
 * Mirror, then compose — the one call path both `initiatePhase` (epic + stories) and `openNested`
 * (a nested run's own sub-tasks) go through, rather than two copies that drift the next time
 * either changes.
 *
 * Composition runs after, never during: opening a phase or a nested run must not wait on a model,
 * and one whose bodies could not be written still has its board. Its failure is returned, never
 * thrown — the work happened whether or not a ticket reads well.
 */
export async function mirrorAndCompose(
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
