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
  storedStatusFor,
  evaluate,
  type CriterionRow,
} from "./gates";
import { mirrorPhase, type Mirrored } from "./tracker";
import { composeTicketBodies, type Composed } from "./ticket-body";

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
 * Mirror, then compose.
 *
 * Composition runs after, never during: opening a phase must not wait on a model, and a phase whose
 * bodies could not be written still has its board. Its failure is returned, never thrown — the work
 * happened whether or not a ticket reads well.
 */
async function putOnBoard(
  engagementId: string, runId: string, roleCode: string,
): Promise<BoardResult> {
  const mirrored = await mirrorPhase(engagementId, runId, roleCode);
  // Nothing on the board is nothing to write on. Composing here would spend a model call producing
  // text with nowhere to go.
  if (!mirrored.epic) return mirrored;

  try {
    return { ...mirrored, composed: await composeTicketBodies(engagementId, runId, roleCode) };
  } catch (e) {
    return {
      ...mirrored,
      composed: {
        written: [], expected: 0, reason: "no-host",
        problems: [`Composing ticket bodies failed: ${e instanceof Error ? e.message : String(e)}`],
      },
    };
  }
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

  // The entry gate, BEFORE anything is created.
  //
  // `requires:` in the phase file is not documentation. The phase that then filled this slot
  // demanded an approved backlog and an approved roster, and the first version of this function
  // initiated it on an engagement that had neither — five tasks materialised against foundations
  // that did not exist. A phase that starts without its gate is a false green with a queue
  // attached.
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

  // OPEN runs only, and the newest of them.
  //
  // This used to match ANY run of the workflow regardless of state, which made a repeating phase
  // impossible: once sprint 1 closed, every attempt to start sprint 2 short-circuited and returned
  // sprint 1's finished run, and the queue looked like the sprint had simply stopped. Worse, the
  // moment two runs existed `.maybeSingle()` errored, so the failure would have changed shape
  // rather than becoming visible.
  //
  // `state = 'open'` is what makes "one sprint at a time" true: a sprint in flight blocks another,
  // a closed one does not. `order` + `limit(1)` keeps `.maybeSingle()` safe against the history
  // that now accumulates.
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
    // Mirror on the way out, even though the run already exists — ESPECIALLY then.
    //
    // `tracker.ts` promises that a phase which could not reach Jira keeps its rows locally and gets
    // its tickets "on the next attempt". This early return was where that promise died: every
    // subsequent initiate short-circuited here, so a phase opened during an outage could never be
    // put on the board at all. `mirrorPhase` is idempotent — a run that already has its epic and
    // stories re-reads their keys and writes nothing.
    const mirrored = await putOnBoard(actor.engagementId, open.id, actor.roleCode);
    return { ok: true, runId: open.id, tasks, mirrored };
  }

  const { data: runId, error } = await sb.rpc("open_phase_run", {
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

  // Measure every task's gate immediately. A phase opens with rows whose Ready state is already
  // knowable — "Connect systems of record" is satisfied by intake and should show as done on the
  // first screen, not after someone clicks re-check on it.
  const tasks = await tasksOfRun(runId as string);

  // The counterpart to phase.refused. `open_phase_run` emits `workflow.opened` for the run, which
  // says a run exists; this says a PERSON committed an engagement to a phase and to how many rows —
  // the decision, not its mechanism. Without both, the record shows refusals with nothing to
  // compare them against.
  await emit({
    engagementId: actor.engagementId,
    subjectType: "workflow_run",
    subjectId: runId as string,
    verb: "phase.initiated",
    actorKind: "human",
    actorRoleCode: actor.roleCode,
    actorUserId: actor.holder ?? null,
    payload: { workflow: workflowCode, rows: tasks.length },
  });

  for (const t of tasks) {
    const statuses = await measureTask(actor, t.id);

    // A machine row dispatches nothing, so there is nobody to start it and nothing to approve —
    // its evidence is the probe. The connector-check row — `setup.md`'s "Validate the connections"
    // — is meant to close on creation, and it did not: it sat idle offering "Start with agent",
    // which would have handed the delivery manager agent a task slug its own file does not define.
    //
    // close_task still enforces the gate. If a connector stops answering, the criteria are
    // unsatisfied, the close is refused, and the row stays open — which is the point of it being a
    // row rather than an assumption.
    const done = statuses.filter((s) => s.kind === "done");
    const machine = await isMachineStep(t.id);
    if (
      machine &&
      done.length > 0 &&
      done.every((s) => s.verdict.state === "satisfied")
    ) {
      const who = actor.holder ?? actor.roleCode;
      // START, then close. close_task refuses an idle task — "never started, there is nothing to
      // approve" — and a machine row is never started because nothing dispatches it, so the close
      // failed silently on every phase until a live run tripped over it. Starting it is truthful:
      // the system did pick it up, ran the checks, and finished. Both routines still enforce their
      // gates, so a connector that stops answering leaves the row open rather than closing it.
      const started = await sb.rpc("start_task", {
        p_task_id: t.id,
        p_actor: who,
        p_actor_role: actor.roleCode,
      });
      if (started.error) {
        // This one used to fail in silence — the `if (!started.error)` below simply skipped the
        // close and the row sat idle with no explanation anywhere.
        await emitRefusal({
          engagementId: actor.engagementId,
          subjectType: "task",
          subjectId: t.id,
          verb: "task.start_refused",
          actorRoleCode: actor.roleCode,
          actorUserId: who,
          reason: started.error.message,
          payload: { title: t.title, at: "phase-open machine row" },
        });
      } else {
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
  const mirrored = await putOnBoard(actor.engagementId, runId as string, actor.roleCode);

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
  // Ordered by the STEP's ord, not created_at. A phase creates every task in one transaction, so
  // their timestamps are identical and created_at ordering is arbitrary — it put step 2 before
  // step 1 on the first real run, which numbered the epic's stories backwards and would show a
  // queue in the wrong dependency order.
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
 * Open the child run for a row that nests a workflow.
 *
 * The row is done when that run closes — the trigger from 034 does that half. This is the other
 * half: someone starting the row.
 */
export async function openNested(
  actor: Actor,
  taskId: string,
): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
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
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, runId: runId as string };
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
    /**
     * Is this phase fully on the board?
     *
     * Read without asking Jira: the keys Compass stores ARE the record of what was created, so a
     * run missing its epic key, or holding a task with no story key, is a phase the board does not
     * have. Null when the phase has not started — nothing is owed yet.
     */
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
    if (!runOf.has(r.workflow_id as string)) runOf.set(r.workflow_id as string, r);
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

  return (wfs ?? []).map((w) => {
    const run = runOf.get(w.id);
    return {
      code: w.code,
      label: w.label,
      // A REPEATABLE phase whose latest run has closed is available again — that is what makes
      // "one sprint at a time" a cycle rather than a single pass. Read from the workflow's own
      // column rather than tested against `code === "sprint"`: a checker that carries the literal
      // it is policing is a mistake this repo has already made once.
      state: run
        ? run.state === "closed"
          ? (w.repeatable ? ("available" as const) : ("closed" as const))
          : ("open" as const)
        : ("available" as const),
      runId: run?.id ?? null,
      onBoard: run ? Boolean(run.ticket_key) && !missing.has(run.id) : null,
    };
  });
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
