// The queue. The only way the app reads or starts a task.
//
// Two filters are applied on every read and neither is optional:
//
//   engagement_id   tenant isolation. There is no RLS yet, so this is the whole guarantee.
//   scope           what this role may see — mine, its workstream, or everyone.
//
// Both come from the Actor, so a caller cannot forget one. When RLS lands, the policies key off
// the same columns and this layer stops being the only thing standing between two clients.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./actor";

/** A card, as the Jobs screen renders it. */
export type TaskCard = {
  id: string;
  title: string;
  subtitle: string;
  state: string;
  kind: string;
  roleCode: string;
  /** "PM agent" — which agent runs this, from the role's row. */
  agentLabel: string | null;
  ticketKey: string | null;
  /** The provenance line: what the agent will read. */
  reads: string[];
  origin: "defined" | "adhoc";
  rationale: string | null;
  workflowCode: string | null;
  /** Which engine picked it up. NULL means nothing has — started is not the same as running. */
  executor: string | null;
  startedAt: string | null;
  startedBy: string | null;
};

type Row = {
  id: string; title: string; subtitle: string; state: string; kind: string;
  role_code: string; ticket_key: string | null; origin: "defined" | "adhoc";
  rationale: string | null; executor: string | null; started_at: string | null; started_by: string | null;
  workflow_step: { reads: string[] | null } | null;
  workflow_run: { workflow: { code: string } | null } | null;
};

const SELECT =
  "id,title,subtitle,state,kind,role_code,ticket_key,origin,rationale,executor,started_at,started_by," +
  "workflow_step(reads),workflow_run(workflow(code))";

/**
 * The role's queue.
 *
 * `open` excludes closed and abandoned work — a queue is what is still yours to do. The Jobs
 * screen never shows finished cards; that is what Plan is for.
 */
export async function tasksFor(actor: Actor, opts: { includeClosed?: boolean } = {}): Promise<TaskCard[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  let q = sb.from("work_task").select(SELECT).eq("engagement_id", actor.engagementId);

  // Scope, from the role's row rather than a constant here.
  if (actor.scope === "mine") q = q.eq("role_code", actor.roleCode);
  else if (actor.scope === "workstream" && actor.workstreamCode) q = q.eq("workstream_code", actor.workstreamCode);

  if (!opts.includeClosed) q = q.not("state", "in", "(closed,abandoned)");

  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) throw new Error(`read queue: ${error.message}`);

  const agentByRole = await agentLabels(actor);

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle ?? "",
    state: r.state,
    kind: r.kind,
    roleCode: r.role_code,
    agentLabel: agentByRole.get(r.role_code) ?? null,
    ticketKey: r.ticket_key,
    reads: r.workflow_step?.reads ?? [],
    origin: r.origin,
    rationale: r.rationale,
    workflowCode: r.workflow_run?.workflow?.code ?? null,
    executor: r.executor,
    startedAt: r.started_at,
    startedBy: r.started_by,
  }));
}

/** role code → "PM agent", for the line under a card's button. */
async function agentLabels(actor: Actor): Promise<Map<string, string>> {
  const sb = supabaseAdmin();
  if (!sb) return new Map();
  const { data } = await sb.from("role").select("code,label,agent").eq("org_id", actor.orgId);
  return new Map((data ?? [])
    .filter((r) => r.agent)
    .map((r) => [r.code as string, `${r.label} agent`]));
}

/**
 * Start a task. Nothing starts itself.
 *
 * Goes through the `start_task` routine rather than an update, so the actor is recorded and a
 * second click is refused rather than silently doing nothing. The event is written by a trigger
 * either way — this is the front door, not the only door.
 */
export async function startTask(actor: Actor, taskId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  // Confirm the task is inside this actor's scope BEFORE starting it. Without this, a task id
  // from another engagement would start perfectly happily — the routine only checks state.
  const mine = await tasksFor(actor, { includeClosed: true });
  if (!mine.some((t) => t.id === taskId)) {
    return { ok: false, error: "That task is not in your queue." };
  }

  const { error } = await sb.rpc("start_task", {
    p_task_id: taskId,
    p_actor: actor.holder ?? actor.roleCode,
    p_actor_role: actor.roleCode,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** What has happened on this engagement, newest first — the record, not a reconstruction. */
export async function recentEvents(actor: Actor, limit = 20) {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const { data } = await sb.from("event")
    .select("verb, actor_kind, actor_user_id, actor_role_code, subject_type, occurred_at, payload")
    .eq("engagement_id", actor.engagementId)
    .order("occurred_at", { ascending: false }).limit(limit);
  return data ?? [];
}
