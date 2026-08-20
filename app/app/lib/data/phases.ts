// Initiating a phase, and working a row that nests a workflow.
//
// This replaces `materialiseBacklog`, which read the kickoff-backlog DOCUMENT and opened a workflow
// run per row. That was v1's `createSprint0` ported faithfully, and it was faithful to the wrong
// thing: it made every row a peer workflow, which is how one engagement ended up with nine runs
// holding six tasks. A row is a unit of work inside a phase, not a phase of its own.
//
// Two cases, and they are the whole surface:
//
//   initiatePhase   the delivery manager starts basecamp or groundwork. Every row becomes a task
//                   in ONE run, up front, because a phase's rows are known when it begins and the
//                   point of a kickoff backlog is that nothing in it is a surprise.
//
//   openNested      a row whose dispatch is `workflow: <code>` opens a CHILD run when someone
//                   starts it. The child closes its parent task when it closes (migration 034).
//
// Both go through database routines. Nothing here inserts a task.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./actor";
import { orgIdFor } from "./events";
import { sortByStep } from "./steps";
import { measureTask, storedStatusFor, evaluate, type CriterionRow } from "./gates";
import { mirrorPhase, type Mirrored } from "./tracker";

export type Initiated =
  | { ok: true; runId: string; tasks: { id: string; title: string; role: string }[]; mirrored?: Mirrored }
  | { ok: false; error: string };

/**
 * Start a phase.
 *
 * Refuses when the phase's entry gate is not satisfied — and says which criterion, because "not
 * ready" with no reason is the thing this product exists to replace. Idempotent: a phase already
 * open on this engagement is returned rather than duplicated.
 */
export async function initiatePhase(actor: Actor, workflowCode: string): Promise<Initiated> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const orgId = await orgIdFor(actor.engagementId);
  const { data: wf } = await sb.from("workflow")
    .select("id, label").eq("org_id", orgId).eq("code", workflowCode).eq("enabled", true).maybeSingle();
  if (!wf) return { ok: false, error: `No workflow '${workflowCode}' in this organisation.` };

  // The entry gate, BEFORE anything is created.
  //
  // `requires:` in the phase file is not documentation. Groundwork demands an approved backlog and
  // an approved roster, and the first version of this function initiated it on an engagement that
  // had neither — five tasks materialised against foundations that did not exist. A phase that
  // starts without its gate is a false green with a queue attached.
  const blocked = await unmetEntryGate(actor, wf.id);
  if (blocked.length) {
    return {
      ok: false,
      error: `${wf.label} is not ready:\n  ` + blocked.join("\n  "),
    };
  }

  const { data: open } = await sb.from("workflow_run")
    .select("id").eq("engagement_id", actor.engagementId).eq("workflow_id", wf.id)
    .is("parent_task_id", null).maybeSingle();
  if (open) {
    const tasks = await tasksOfRun(open.id);
    return { ok: true, runId: open.id, tasks };
  }

  const { data: runId, error } = await sb.rpc("open_phase_run", {
    p_org_id: orgId, p_engagement_id: actor.engagementId, p_workflow_code: workflowCode,
    p_actor: actor.holder ?? actor.roleCode, p_actor_role: actor.roleCode,
  });
  if (error) return { ok: false, error: error.message };

  // Measure every task's gate immediately. A phase opens with rows whose Ready state is already
  // knowable — "Connect systems of record" is satisfied by intake and should show as done on the
  // first screen, not after someone clicks re-check on it.
  const tasks = await tasksOfRun(runId as string);
  for (const t of tasks) {
    const statuses = await measureTask(actor, t.id);

    // A machine row dispatches nothing, so there is nobody to start it and nothing to approve —
    // its evidence is the probe. basecamp.md says "Connect systems of record" closes on creation,
    // and it did not: it sat idle offering "Start with agent", which would have handed the delivery
    // manager agent a task slug its own file does not define.
    //
    // close_task still enforces the gate. If a connector stops answering, the criteria are
    // unsatisfied, the close is refused, and the row stays open — which is the point of it being a
    // row rather than an assumption.
    const done = statuses.filter((s) => s.kind === "done");
    const machine = await isMachineStep(t.id);
    if (machine && done.length > 0 && done.every((s) => s.verdict.state === "satisfied")) {
      const who = actor.holder ?? actor.roleCode;
      // START, then close. close_task refuses an idle task — "never started, there is nothing to
      // approve" — and a machine row is never started because nothing dispatches it, so the close
      // failed silently on every phase until a live run tripped over it. Starting it is truthful:
      // the system did pick it up, ran the checks, and finished. Both routines still enforce their
      // gates, so a connector that stops answering leaves the row open rather than closing it.
      const started = await sb.rpc("start_task", {
        p_task_id: t.id, p_actor: who, p_actor_role: actor.roleCode,
      });
      if (!started.error) {
        await sb.rpc("close_task", { p_task_id: t.id, p_actor: who, p_actor_role: actor.roleCode });
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
  const mirrored = await mirrorPhase(actor.engagementId, runId as string, actor.roleCode);

  return { ok: true, runId: runId as string, tasks, mirrored };
}

async function tasksOfRun(runId: string) {
  const sb = supabaseAdmin();
  if (!sb) return [];
    // Ordered by the STEP's ord, not created_at. A phase creates every task in one transaction, so
    // their timestamps are identical and created_at ordering is arbitrary — it put step 2 before
    // step 1 on the first real run, which numbered the epic's stories backwards and would show a
    // queue in the wrong dependency order.
  const { data } = await sb.from("work_task")
    .select("id, title, role_code, workflow_step_id, workflow_step(ord)")
    .eq("workflow_run_id", runId);
  return sortByStep(data ?? []).map((t) => ({ id: t.id, title: t.title, role: t.role_code }));
}

/**
 * Open the child run for a row that nests a workflow.
 *
 * The row is done when that run closes — the trigger from 034 does that half. This is the other
 * half: someone starting the row.
 */
export async function openNested(
  actor: Actor, taskId: string,
): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const { data: task } = await sb.from("work_task")
    .select("id, workflow_step_id").eq("id", taskId).eq("engagement_id", actor.engagementId).maybeSingle();
  if (!task) return { ok: false, error: "That task is not in your engagement." };

  const { data: runId, error } = await sb.rpc("open_nested_run", {
    p_task_id: taskId, p_actor: actor.holder ?? actor.roleCode, p_actor_role: actor.roleCode,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, runId: runId as string };
}

/** Is this task's row a machine check — something measured rather than performed? */
async function isMachineStep(taskId: string): Promise<boolean> {
  const sb = supabaseAdmin();
  if (!sb) return false;
  const { data: task } = await sb.from("work_task")
    .select("workflow_step_id").eq("id", taskId).maybeSingle();
  if (!task?.workflow_step_id) return false;
  const { data: step } = await sb.from("workflow_step")
    .select("kind").eq("id", task.workflow_step_id).maybeSingle();
  return step?.kind === "machine";
}

/** Does this task's row nest a workflow? The queue needs to know — it changes what the button does. */
export async function nestedWorkflowOf(taskId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data: task } = await sb.from("work_task")
    .select("workflow_step_id").eq("id", taskId).maybeSingle();
  if (!task?.workflow_step_id) return null;
  const { data: step } = await sb.from("workflow_step")
    .select("nests_workflow_code").eq("id", task.workflow_step_id).maybeSingle();
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
  { code: string; label: string; state: "open" | "closed" | "available"; runId: string | null }[]
> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const orgId = await orgIdFor(actor.engagementId);

  const { data: wfs } = await sb.from("workflow")
    .select("id, code, label").eq("org_id", orgId).in("code", ["basecamp", "groundwork"]);
  const { data: runs } = await sb.from("workflow_run")
    .select("id, workflow_id, state").eq("engagement_id", actor.engagementId).is("parent_task_id", null);

  const runOf = new Map((runs ?? []).map((r) => [r.workflow_id as string, r]));
  // Declaration order, not alphabetical: groundwork follows basecamp and showing them the other way
  // round would misrepresent the sequence.
  const order = ["basecamp", "groundwork"];
  return (wfs ?? [])
    .sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code))
    .map((w) => {
      const run = runOf.get(w.id);
      return {
        code: w.code, label: w.label,
        state: run ? (run.state === "closed" ? "closed" as const : "open" as const) : "available" as const,
        runId: run?.id ?? null,
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
async function unmetEntryGate(actor: Actor, workflowId: string): Promise<string[]> {
  const sb = supabaseAdmin();
  if (!sb) return ["Supabase is not configured."];

  const { data: ver } = await sb.from("workflow_version")
    .select("id").eq("workflow_id", workflowId).eq("status", "published").maybeSingle();
  if (!ver) return ["That workflow has no published version."];

  const { data: rows } = await sb.from("criterion")
    .select("id, kind, step_ord, statement, subject_kind, subject_ref, operator, value")
    .eq("workflow_version_id", ver.id).eq("kind", "ready").is("step_ord", null);

  const out: string[] = [];
  for (const r of rows ?? []) {
    const c: CriterionRow = {
      id: r.id, kind: "ready", stepOrd: null, statement: r.statement ?? "",
      subjectKind: r.subject_kind, subjectRef: r.subject_ref,
      operator: r.operator, value: r.value,
    };
    const v = await evaluate(actor, c, null);
    if (v.state === "satisfied") continue;
    const label = c.statement || `${c.subjectKind} ${c.subjectRef}`;
    out.push(v.state === "unmeasurable"
      ? `${label} — could not be checked: ${"why" in v ? v.why : "no reason recorded"}`
      : `${label} — not satisfied`);
  }
  return out;
}
