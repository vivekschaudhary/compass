// The writing half of `reset-workflow.ts` — same split as `reset-apply.ts`/`reset.ts`, for the
// same reason: the part worth testing without a database is which rows belong to the scope and in
// what order they go, not the HTTP plumbing around them.

import { supabaseAdmin } from "../supabase.ts";
import {
  planWorkflowReset,
  type WorkflowResetPlan,
  type WorkflowResetSnapshot,
} from "./reset-workflow.ts";
import { resolveActor } from "./actor.ts";
import { measureTask, type CriterionStatus } from "./gates.ts";
import type { Refusal } from "../envelope.ts";

const CHUNK = 200;

export type WorkflowResetRun =
  | { ok: true; plan: WorkflowResetPlan; cleared: boolean; remeasured?: CriterionStatus[] }
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

  const { data: tasks, error: tasksError } = runIds.length
    ? await sb.from("work_task").select("id").in("workflow_run_id", runIds)
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
    engagementId,
    nestingTaskId,
    nestsWorkflowCode,
    runs: (runs ?? []).map((r) => ({ id: r.id as string })),
    tasks: (tasks ?? []).map((t) => ({ id: t.id as string })),
    documents: (documents ?? []).map((d) => ({
      id: d.id as string, path: d.path as string, externalUrl: (d.external_url as string | null) ?? null,
    })),
    events: (events ?? []).map((e) => ({ id: e.id as string })),
  };
}

export async function resetWorkflow(
  engagementId: string,
  ref: string,
  { apply }: { apply: boolean },
): Promise<WorkflowResetRun> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, refusals: [{ message: "Supabase is not configured." }] };

  const resolved = await resolveNestingTask(engagementId, ref);
  if (!resolved.ok) return { ok: false, refusals: [{ message: resolved.error }] };

  const snap = await snapshotWorkflowReset(engagementId, resolved.taskId, resolved.nestsWorkflowCode);
  const planned = planWorkflowReset(snap);
  if (!planned.ok) return { ok: false, refusals: planned.refusals };
  if (!apply) return { ok: true, plan: planned.plan, cleared: false };

  const docIds = planned.plan.deletes.find((d) => d.table === "document")?.ids ?? [];
  for (let i = 0; i < docIds.length; i += CHUNK) {
    const { error } = await sb.from("document")
      .update({ current_version_id: null }).in("id", docIds.slice(i, i + CHUNK));
    if (error) throw new Error(`clear current_version_id: ${error.message}`);
  }

  // Re-runnable, not atomic — no transaction through PostgREST, same as `resetEngagement`. Every
  // step deletes by id, so running it twice removes nothing extra.
  for (const step of planned.plan.deletes) {
    for (let i = 0; i < step.ids.length; i += CHUNK) {
      const { error } = await sb.from(step.table).delete().in("id", step.ids.slice(i, i + CHUNK));
      if (error) throw new Error(`delete ${step.table}: ${error.message}`);
    }
  }

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

  return { ok: true, plan: planned.plan, cleared: true, remeasured };
}
