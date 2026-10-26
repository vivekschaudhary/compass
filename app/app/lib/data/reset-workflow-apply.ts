// The writing half of `reset-workflow.ts` — same split as `reset-apply.ts`/`reset.ts`, for the
// same reason: the part worth testing without a database is which rows belong to the scope and in
// what order they go, not the HTTP plumbing around them.

import { supabaseAdmin } from "../supabase.ts";
import {
  planWorkflowReset,
  planRunReset,
  type WorkflowResetPlan,
  type WorkflowDeleteStep,
  type WorkflowResetSnapshot,
  type RunResetPlan,
  type RunResetSnapshot,
} from "./reset-workflow.ts";
import { resolveActor } from "./actor.ts";
import { measureTask, type CriterionStatus } from "./gates.ts";
import type { Refusal } from "../envelope.ts";

const CHUNK = 200;

export type WorkflowResetRun =
  | { ok: true; kind: "nesting"; plan: WorkflowResetPlan; cleared: boolean; remeasured?: CriterionStatus[] }
  | { ok: true; kind: "run"; plan: RunResetPlan; cleared: boolean }
  | { ok: false; refusals: Refusal[] };

/**
 * `ref` is either the nesting row's own task id, or the workflow code it nests (`"timeline"`) —
 * whichever is easier for whoever is calling this to have on hand. A task id is unambiguous; a
 * code is a lookup, and this engagement is the only place it has to be unique.
 */
export async function resolveNestingTask(
  engagementId: string,
  ref: string,
): Promise<
  | { ok: true; taskId: string; nestsWorkflowCode: string; title: string; roleCode: string }
  | { ok: false; error: string }
> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  // A workflow code ("timeline") is not a UUID, and asking Postgres to compare a non-UUID string
  // against a `uuid` column is a 400 from PostgREST, not an empty result — skip the id lookup
  // rather than let a plain code fail as though it were a malformed id.
  const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  if (looksLikeId) {
    const byId = await sb
      .from("work_task")
      .select("id, title, role_code, workflow_step(nests_workflow_code)")
      .eq("id", ref)
      .eq("engagement_id", engagementId)
      .maybeSingle();
    if (byId.error) return { ok: false, error: `resolve task: ${byId.error.message}` };
    if (byId.data) {
      const step = Array.isArray(byId.data.workflow_step)
        ? byId.data.workflow_step[0]
        : byId.data.workflow_step;
      const code = (step?.nests_workflow_code as string | null) ?? null;
      if (!code) {
        return { ok: false, error: `Task '${ref}' ("${byId.data.title}") does not nest a workflow.` };
      }
      return {
        ok: true, taskId: byId.data.id as string, nestsWorkflowCode: code,
        title: byId.data.title as string, roleCode: byId.data.role_code as string,
      };
    }
  }

  // Not a task id — try it as a workflow code, among the rows that nest one.
  const { data: candidates, error } = await sb
    .from("work_task")
    .select("id, title, role_code, workflow_step(nests_workflow_code)")
    .eq("engagement_id", engagementId)
    .not("workflow_step_id", "is", null);
  if (error) return { ok: false, error: `resolve workflow code: ${error.message}` };

  const matches = (candidates ?? []).filter((t) => {
    const step = Array.isArray(t.workflow_step) ? t.workflow_step[0] : t.workflow_step;
    return (step?.nests_workflow_code as string | null) === ref;
  });
  if (!matches.length) {
    return { ok: false, error: `No task nests a workflow called '${ref}' on this engagement, and no task has that id.` };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: `'${ref}' nests from more than one row: ${matches.map((m) => `${m.title} (${m.id})`).join(", ")}. Pass the task id instead.`,
    };
  }
  const m = matches[0];
  return {
    ok: true, taskId: m.id as string, nestsWorkflowCode: ref,
    title: m.title as string, roleCode: m.role_code as string,
  };
}

/** What hangs off a set of runs: their tasks, the documents those tasks filed, the events they wrote. */
async function snapshotRuns(runIds: string[]) {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("Supabase is not configured.");

  const { data: tasks, error: tasksError } = runIds.length
    ? await sb.from("work_task").select("id, ticket_key").in("workflow_run_id", runIds)
    : { data: [], error: null };
  if (tasksError) throw new Error(`read tasks: ${tasksError.message}`);
  const taskIds = (tasks ?? []).map((t) => t.id as string);

  const { data: versions, error: versionsError } = taskIds.length
    ? await sb.from("document_version").select("document_id").in("created_by_task_id", taskIds)
    : { data: [], error: null };
  if (versionsError) throw new Error(`read document versions: ${versionsError.message}`);
  const documentIds = [...new Set((versions ?? []).map((v) => v.document_id as string))];

  const { data: documents, error: documentsError } = documentIds.length
    ? await sb.from("document").select("id, path, external_url").in("id", documentIds)
    : { data: [], error: null };
  if (documentsError) throw new Error(`read documents: ${documentsError.message}`);

  const subjectIds = [...runIds, ...taskIds];
  const { data: events, error: eventsError } = subjectIds.length
    ? await sb.from("event").select("id").in("subject_id", subjectIds)
    : { data: [], error: null };
  if (eventsError) throw new Error(`read events: ${eventsError.message}`);

  return {
    tasks: (tasks ?? []).map((t) => ({ id: t.id as string, ticketKey: (t.ticket_key as string | null) ?? null })),
    documents: (documents ?? []).map((d) => ({
      id: d.id as string, path: d.path as string, externalUrl: (d.external_url as string | null) ?? null,
    })),
    events: (events ?? []).map((e) => ({ id: e.id as string })),
  };
}

export async function snapshotWorkflowReset(
  engagementId: string,
  nestingTaskId: string,
  nestsWorkflowCode: string,
): Promise<WorkflowResetSnapshot> {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("Supabase is not configured.");

  const { data: runs, error: runsError } = await sb
    .from("workflow_run")
    .select("id")
    .eq("engagement_id", engagementId)
    .eq("parent_task_id", nestingTaskId);
  if (runsError) throw new Error(`read runs: ${runsError.message}`);
  const runIds = (runs ?? []).map((r) => r.id as string);

  const rest = await snapshotRuns(runIds);
  return {
    engagementId,
    nestingTaskId,
    nestsWorkflowCode,
    runs: runIds.map((id) => ({ id })),
    tasks: rest.tasks.map((t) => ({ id: t.id })),
    documents: rest.documents,
    events: rest.events,
  };
}

/**
 * The top-level run(s) a `ref` names. `ref` is a run id, or `<workflow code>:<subject>` where the
 * subject is the epic's Jira key or ref (`tech-design:CT-288`). A run a nesting row opened is refused
 * here — that is `resolveNestingTask`'s — so the two never both claim one run.
 */
export async function resolveTopLevelRuns(
  engagementId: string,
  ref: string,
): Promise<{ ok: true; workflowCode: string; runs: RunResetSnapshot["runs"] } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  const colon = ref.indexOf(":");
  if (!looksLikeId && colon < 1) {
    return { ok: false, error: `'${ref}' is not a run id or <workflow code>:<subject> (e.g. tech-design:CT-288).` };
  }

  const { data, error } = await sb
    .from("workflow_run")
    .select("id, state, subject_ref, subject_key, parent_task_id, workflow(code)")
    .eq("engagement_id", engagementId)
    .is("parent_task_id", null);
  if (error) return { ok: false, error: `resolve run: ${error.message}` };

  const codeOf = (r: { workflow: unknown }) => {
    const w = Array.isArray(r.workflow) ? r.workflow[0] : r.workflow;
    return ((w as { code?: string } | null)?.code ?? "") as string;
  };
  const rows = data ?? [];
  const hits = looksLikeId
    ? rows.filter((r) => r.id === ref)
    : rows.filter((r) => codeOf(r) === ref.slice(0, colon)
        && (r.subject_key === ref.slice(colon + 1) || r.subject_ref === ref.slice(colon + 1)));

  if (!hits.length) {
    return { ok: false, error: `No top-level run matches '${ref}' on this engagement.` };
  }
  if (!looksLikeId && hits.length > 1) {
    return { ok: false, error: `'${ref}' matches ${hits.length} runs (${hits.map((h) => h.id).join(", ")}). Pass the run id of the one to reset.` };
  }
  return {
    ok: true,
    workflowCode: codeOf(hits[0]),
    runs: hits.map((r) => ({
      id: r.id as string, state: r.state as string,
      subjectRef: (r.subject_ref as string | null) ?? null, subjectKey: (r.subject_key as string | null) ?? null,
    })),
  };
}

export async function snapshotRunReset(
  engagementId: string,
  workflowCode: string,
  runs: RunResetSnapshot["runs"],
): Promise<RunResetSnapshot> {
  const rest = await snapshotRuns(runs.map((r) => r.id));
  return { engagementId, workflowCode, runs, tasks: rest.tasks, documents: rest.documents, events: rest.events };
}

/**
 * Do the deletes a plan lists. Re-runnable, not atomic — no transaction through PostgREST, same as
 * `resetEngagement`. Every step deletes by id, so running it twice removes nothing extra.
 */
async function applyDeletes(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>,
  deletes: WorkflowDeleteStep[],
): Promise<void> {
  // `document.current_version_id` has no `on delete` rule, so it is nulled first rather than
  // depending on delete order.
  const docIds = deletes.find((d) => d.table === "document")?.ids ?? [];
  for (let i = 0; i < docIds.length; i += CHUNK) {
    const { error } = await sb.from("document")
      .update({ current_version_id: null }).in("id", docIds.slice(i, i + CHUNK));
    if (error) throw new Error(`clear current_version_id: ${error.message}`);
  }
  for (const step of deletes) {
    for (let i = 0; i < step.ids.length; i += CHUNK) {
      const { error } = await sb.from(step.table).delete().in("id", step.ids.slice(i, i + CHUNK));
      if (error) throw new Error(`delete ${step.table}: ${error.message}`);
    }
  }
}

export async function resetWorkflow(
  engagementId: string,
  ref: string,
  { apply }: { apply: boolean },
): Promise<WorkflowResetRun> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, refusals: [{ message: "Supabase is not configured." }] };

  const resolved = await resolveNestingTask(engagementId, ref);
  if (!resolved.ok) {
    // Not a nesting row — a per-epic run (`tech-design:CT-288`, or a run id) has no row to point at.
    const topLevel = await resolveTopLevelRuns(engagementId, ref);
    if (!topLevel.ok) {
      return { ok: false, refusals: [{ message: resolved.error }, { message: topLevel.error }] };
    }
    const snap = await snapshotRunReset(engagementId, topLevel.workflowCode, topLevel.runs);
    const planned = planRunReset(snap);
    if (!planned.ok) return { ok: false, refusals: planned.refusals };
    if (!apply) return { ok: true, kind: "run", plan: planned.plan, cleared: false };
    await applyDeletes(sb, planned.plan.deletes);
    return { ok: true, kind: "run", plan: planned.plan, cleared: true };
  }

  const snap = await snapshotWorkflowReset(engagementId, resolved.taskId, resolved.nestsWorkflowCode);
  const planned = planWorkflowReset(snap);
  if (!planned.ok) return { ok: false, refusals: planned.refusals };
  if (!apply) return { ok: true, kind: "nesting", plan: planned.plan, cleared: false };

  await applyDeletes(sb, planned.plan.deletes);

  // The nesting row itself, LAST — deleting its child run first and only then clearing the row
  // means a failure partway through never leaves the row looking idle while its old run still
  // exists underneath it.
  for (const r of planned.plan.resets) {
    const { error } = await sb.from(r.table).update(r.fields).eq("id", r.id);
    if (error) throw new Error(`reset ${r.table} ${r.id}: ${error.message}`);
  }

  // Re-measure the nesting row itself, now that the reset is done. The deletes above clear the
  // CHILD tasks' measurements as a cascade of deleting those tasks, but the nesting row's own
  // Done/Ready measurements were written back when its old run actually closed, and nothing
  // above touches them. Left alone, the queue keeps reading Done satisfied — from a run that no
  // longer exists — until someone happens to hit re-check. `measureTask` already clears a
  // criterion it can no longer evaluate rather than leaving yesterday's answer standing (see its
  // own comment), which is exactly "Done" once the run underneath it is gone.
  const actor = await resolveActor(engagementId, resolved.roleCode);
  const remeasured = actor ? await measureTask(actor, resolved.taskId) : undefined;

  return { ok: true, kind: "nesting", plan: planned.plan, cleared: true, remeasured };
}
