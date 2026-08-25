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
import { pinInputs } from "../agent/context";
import { emitRefusal } from "./events";

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
  /** `machine` dispatches nothing — offering "Start with agent" on one is offering a dead end. */
  stepKind: string | null;
  origin: "defined" | "adhoc";
  rationale: string | null;
  workflowCode: string | null;
  /** Which engine picked it up. NULL means nothing has — started is not the same as running. */
  executor: string | null;
  /** How many of the agent's questions are still blocking this task. */
  openQuestions: number;
  startedAt: string | null;
  startedBy: string | null;
};

type Row = {
  id: string; title: string; subtitle: string; state: string; kind: string;
  role_code: string; ticket_key: string | null; origin: "defined" | "adhoc";
  rationale: string | null; executor: string | null; started_at: string | null; started_by: string | null;
  // `ord` and `opened_at` are here to ORDER the queue, not to render it — see `queueOrder`.
  workflow_step: { reads: string[] | null; kind: string | null; ord: number } | null;
  workflow_run: { opened_at: string | null; workflow: { code: string } | null } | null;
};

/** PostgREST types a to-one relation as an array. Normalise rather than casting a lie. */
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

/**
 * The order a queue should read in: by run, then by the step's position in it.
 *
 * NOT `created_at`. A phase inserts every one of its rows in ONE transaction, so their timestamps
 * are identical to the millisecond and ordering by them is arbitrary — the same defect `sortByStep`
 * was written for, which numbered an epic's stories backwards on the first real run.
 *
 * The run comes first because `ord` is only meaningful WITHIN a version: sorting on it alone puts
 * setup's row 1 beside sprint-0's row 1, interleaving two phases that ran weeks apart. Phases run in
 * sequence, so when a run opened is their real order.
 *
 * Rows with no step — ad-hoc work — sort last rather than interleaving, because there is no position
 * they could honestly claim among rows that have one.
 */
export function queueOrder(a: Row, b: Row): number {
  const runA = one(a.workflow_run)?.opened_at ?? "";
  const runB = one(b.workflow_run)?.opened_at ?? "";
  if (runA !== runB) {
    // Ad-hoc rows have no run either; an empty string would sort them first, which is the opposite
    // of what the step rule below decides, so they are pushed to the end here too.
    if (!runA) return 1;
    if (!runB) return -1;
    return runA < runB ? -1 : 1;
  }
  const ordA = one(a.workflow_step)?.ord ?? Number.MAX_SAFE_INTEGER;
  const ordB = one(b.workflow_step)?.ord ?? Number.MAX_SAFE_INTEGER;
  return ordA - ordB;
}

const SELECT =
  "id,title,subtitle,state,kind,role_code,ticket_key,origin,rationale,executor,started_at,started_by," +
  "workflow_step(reads,kind,ord),workflow_run!work_task_workflow_run_id_fkey(opened_at,workflow(code))";

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

  // `created_at` is the TIE-BREAK, not the order — the sort below is. Ordering on the embedded
  // step is not an option: PostgREST sorts the embedded rows, not the parent ones, which is why the
  // step's ord travels on the row and the comparison happens here.
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) throw new Error(`read queue: ${error.message}`);

  const agentByRole = await agentLabels(actor);

  // One query for the whole list rather than one per card.
  const ids = ((data ?? []) as unknown as Row[]).map((r) => r.id);
  const { data: qs } = ids.length
    ? await sb.from("question").select("task_id").in("task_id", ids).eq("state", "open")
    : { data: [] };
  const openByTask = new Map<string, number>();
  for (const q of qs ?? []) openByTask.set(q.task_id, (openByTask.get(q.task_id) ?? 0) + 1);

  return ((data ?? []) as unknown as Row[]).sort(queueOrder).map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle ?? "",
    state: r.state,
    kind: r.kind,
    roleCode: r.role_code,
    agentLabel: agentByRole.get(r.role_code) ?? null,
    ticketKey: r.ticket_key,
    reads: r.workflow_step?.reads ?? [],
    stepKind: r.workflow_step?.kind ?? null,
    origin: r.origin,
    rationale: r.rationale,
    workflowCode: r.workflow_run?.workflow?.code ?? null,
    executor: r.executor,
    openQuestions: openByTask.get(r.id) ?? 0,
    startedAt: r.started_at,
    startedBy: r.started_by,
  }));
}

/**
 * How much has EVER started, whatever state it is in now.
 *
 * The queue cannot answer this and must not be asked to. `tasksFor` drops closed and abandoned
 * work — correctly, a queue is what is still yours to do — so the moment the only task that ever
 * ran is accepted, every row left in the queue has a null `started_at` and "has anything run?"
 * comes back false. The Jobs screen shipped exactly that: it told a delivery manager nothing had
 * run yet on an engagement whose SOW had been drafted, reviewed and closed an hour earlier.
 *
 * So the question gets its own read, over the unfiltered set. `started_at` is a sound witness —
 * the table's own check constraint makes `idle` and a null `started_at` the same fact — the defect
 * was asking it of a population the answer had been filtered out of.
 *
 * Scoped identically to `tasksFor`. History is not a place the rules relax, and a count that
 * ignored the role's scope would leak the shape of an engagement to someone who may not see it.
 */
export async function startedCounts(actor: Actor): Promise<{ mine: number; visible: number }> {
  const sb = supabaseAdmin();
  if (!sb) return { mine: 0, visible: 0 };

  // `role_code` only: this is a count, and the started set is tens of rows engagement-wide, so one
  // round trip returning both numbers beats two head-counts that could disagree with each other.
  let q = sb.from("work_task").select("role_code")
    .eq("engagement_id", actor.engagementId)
    .not("started_at", "is", null);

  if (actor.scope === "mine") q = q.eq("role_code", actor.roleCode);
  else if (actor.scope === "workstream" && actor.workstreamCode) q = q.eq("workstream_code", actor.workstreamCode);

  const { data, error } = await q;
  if (error) throw new Error(`read started counts: ${error.message}`);

  const rows = data ?? [];
  return {
    mine: rows.filter((r) => r.role_code === actor.roleCode).length,
    visible: rows.length,
  };
}

/**
 * Which of the Jobs screen's two claims about an empty-looking queue is true.
 *
 * Pure, and separate from the query for the same reason `queueOrder` is: the decision is where the
 * defect lived, so it is the thing that needs to be testable without a database.
 *
 * Both sentences are about ABSENCE, which is why they were wrong. "Nothing has run yet" and "work
 * arrives when an upstream job publishes" are true on a fresh engagement and false on a finished
 * one, and the queue alone cannot tell those apart — an engagement whose every row has closed and
 * an engagement that has not begun both present as an empty list.
 */
export function queueNotices(x: {
  /** Cards in the queue owned by this role. */
  mineQueued: number;
  /** Cards in the queue at all, this role's and everyone else's in scope. */
  totalQueued: number;
  /** Tasks this role has ever started, closed ones included. */
  startedMine: number;
  /** Tasks anyone in scope has ever started, closed ones included. */
  startedVisible: number;
}): { banner: "never-run" | null; empty: "none-yet" | "all-done" | null } {
  // Only claim nothing has run when nothing has — over every task this role owns, not over the
  // ones still waiting. With work in the queue to explain, and none of it yet touched.
  const banner = x.startedMine === 0 && x.mineQueued > 0 ? "never-run" : null;

  // An empty queue is either "not yet" or "all done", and the difference is whether anything ever
  // started. Nothing else can distinguish them: both have no cards to show.
  const empty = x.totalQueued > 0 ? null : x.startedVisible > 0 ? "all-done" : "none-yet";

  return { banner, empty };
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
  if (error) {
    // Two different refusals reach here — an unmet Ready criterion, and a dependency that has not
    // closed — and they mean different things to whoever is stuck. The routine distinguishes them
    // in its message, so the message is kept verbatim and the kind is recorded alongside it,
    // because "how often does a phase stall waiting on its own rows" is a question worth being
    // able to ask of the record.
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task", subjectId: taskId,
      verb: "task.start_refused",
      actorRoleCode: actor.roleCode, actorUserId: actor.holder ?? null,
      reason: error.message,
      payload: { gate: error.message.startsWith("Waiting on") ? "depends_on" : "ready" },
    });
    return { ok: false, error: error.message };
  }

  // Pin what this task reads, at the versions live right now. After this the task's inputs are
  // fixed: editing a source document creates a new version and does not silently change what this
  // task was working from. Deliberately after the start succeeded — a refused start reads nothing.
  await pinInputs(taskId, actor.engagementId);

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
