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
import { unmetToStart, describeBlockers } from "./start-gate";

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
  /** `doc-review`/`code-review` — this row reviews someone else's work, not its own. See `renders`
   *  on `workflow_step`. Null for an ordinary authoring row, or a step imported before the column
   *  existed. */
  renders: string | null;
  /**
   * The workflow this row NESTS, if any — its work happens in a child run's steps, not here.
   *
   * The card's button already behaves correctly on such a row (`startWorkflowAction` opens the
   * child run), but said "Start with agent", promising an agent that does not exist for it. The
   * label needs the same fact the action has.
   */
  nests: string | null;
  origin: "defined" | "adhoc";
  rationale: string | null;
  workflowCode: string | null;
  /** Which engine picked it up. NULL means nothing has — started is not the same as running. */
  executor: string | null;
  /** How many of the agent's questions are still blocking this task. */
  openQuestions: number;
  startedAt: string | null;
  startedBy: string | null;
  /** The run this row belongs to. */
  runId: string | null;
  /**
   * The task whose row opened that run — null at the top level.
   *
   * This is what makes a nesting row's work findable. Without it the rows a nesting row opened are
   * loose cards with nothing saying where they came from, and when a child's title repeats its
   * parent's — four of the seed's ten nesting rows do — the queue shows two cards with one name.
   */
  parentTaskId: string | null;
  runState: string | null;
  /** The `{epic}` a fan-out run is the subject of, so sibling runs are tellable apart. */
  runSubject: string | null;
};

type Row = {
  id: string;
  title: string;
  subtitle: string;
  state: string;
  kind: string;
  role_code: string;
  ticket_key: string | null;
  origin: "defined" | "adhoc";
  rationale: string | null;
  executor: string | null;
  started_at: string | null;
  started_by: string | null;
  // `ord` and `opened_at` are here to ORDER the queue, not to render it — see `queueOrder`.
  workflow_step: {
    reads: string[] | null;
    kind: string | null;
    ord: number;
    nests_workflow_code: string | null;
    renders: string | null;
  } | null;
  workflow_run: {
    id: string;
    opened_at: string | null;
    state: string | null;
    parent_task_id: string | null;
    subject_key: string | null;
    workflow: { code: string } | null;
  } | null;
};

/** PostgREST types a to-one relation as an array. Normalise rather than casting a lie. */
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
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
  "workflow_step(reads,kind,ord,nests_workflow_code,renders)," +
  // `parent_task_id` rides on the join that was already here. Grouping the queue costs no query.
  "workflow_run!work_task_workflow_run_id_fkey(id,opened_at,state,parent_task_id,subject_key,workflow(code))";

/**
 * The role's queue.
 *
 * `open` excludes closed and abandoned work — a queue is what is still yours to do. The Jobs
 * screen never shows finished cards; that is what Plan is for.
 */
export async function tasksFor(
  actor: Actor,
  opts: { includeClosed?: boolean } = {},
): Promise<TaskCard[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  let q = sb
    .from("work_task")
    .select(SELECT)
    .eq("engagement_id", actor.engagementId);

  // Scope, from the role's row rather than a constant here.
  if (actor.scope === "mine") q = q.eq("role_code", actor.roleCode);
  else if (actor.scope === "workstream" && actor.workstreamCode)
    q = q.eq("workstream_code", actor.workstreamCode);

  if (!opts.includeClosed) q = q.not("state", "in", "(closed,abandoned)");

  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) throw new Error(`read queue: ${error.message}`);

  const agentByRole = await agentLabels(actor);

  // One query for the whole list rather than one per card.
  const ids = ((data ?? []) as unknown as Row[]).map((r) => r.id);
  const { data: qs } = ids.length
    ? await sb
        .from("question")
        .select("task_id")
        .in("task_id", ids)
        .eq("state", "open")
    : { data: [] };
  const openByTask = new Map<string, number>();
  for (const q of qs ?? [])
    openByTask.set(q.task_id, (openByTask.get(q.task_id) ?? 0) + 1);

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
    renders: r.workflow_step?.renders ?? null,
    nests: r.workflow_step?.nests_workflow_code ?? null,
    origin: r.origin,
    rationale: r.rationale,
    workflowCode: r.workflow_run?.workflow?.code ?? null,
    executor: r.executor,
    openQuestions: openByTask.get(r.id) ?? 0,
    startedAt: r.started_at,
    startedBy: r.started_by,
    runId: one(r.workflow_run)?.id ?? null,
    parentTaskId: one(r.workflow_run)?.parent_task_id ?? null,
    runState: one(r.workflow_run)?.state ?? null,
    runSubject: one(r.workflow_run)?.subject_key ?? null,
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
export async function startedCounts(
  actor: Actor,
): Promise<{ mine: number; visible: number }> {
  const sb = supabaseAdmin();
  if (!sb) return { mine: 0, visible: 0 };

  // `role_code` only: this is a count, and the started set is tens of rows engagement-wide, so one
  // round trip returning both numbers beats two head-counts that could disagree with each other.
  let q = sb
    .from("work_task")
    .select("role_code")
    .eq("engagement_id", actor.engagementId)
    .not("started_at", "is", null);

  if (actor.scope === "mine") q = q.eq("role_code", actor.roleCode);
  else if (actor.scope === "workstream" && actor.workstreamCode)
    q = q.eq("workstream_code", actor.workstreamCode);

  const { data, error } = await q;
  if (error) throw new Error(`read started counts: ${error.message}`);

  const rows = data ?? [];
  return {
    mine: rows.filter((r) => r.role_code === actor.roleCode).length,
    visible: rows.length,
  };
}

/**
 * Which of the Jobs screen's three claims about an empty-looking queue is true.
 *
 * Pure, and separate from the query for the same reason `queueOrder` is: the decision is where the
 * defect lived, so it is the thing that needs to be testable without a database.
 *
 * THE SECOND DEFECT this caught, after the one below it: `empty` used to gate on `totalQueued` —
 * everyone's cards in scope, not just this role's. An `everyone`-scope oversight role (Principal
 * Engineer, PM) sees every OTHER role's tasks too, so on a busy engagement `totalQueued` is never
 * zero even when this role's OWN queue — `mineQueued` — genuinely is. `empty` came back `null`,
 * `TasksTable` filtered to `myRole`, found nothing, and rendered nothing: not the empty state, not
 * the table, a blank page below the blurb. `mineQueued` is what decides whether THIS role's queue
 * is empty; `totalQueued` only tells the two empty cases apart from a third — see `waiting`.
 *
 * Three sentences, not two, because an empty queue is not always the same absence:
 *   `none-yet`  nothing exists ANYWHERE in scope yet — a true, fresh kickoff.
 *   `waiting`   nothing is at THIS role's gate, but the engagement is plainly active elsewhere —
 *               an oversight role between gates, not a stalled or finished engagement.
 *   `all-done`  nothing exists anywhere in scope, and something once did — every visible row
 *               closed, not merely this role's.
 * Collapsing `waiting` into `all-done` (as an earlier version did, via `totalQueued`) told an
 * approver "everything here is done" while the engagement was mid-flight; collapsing it into
 * `none-yet` would tell them nothing had started when eleven other rows already had.
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
}): { banner: "never-run" | null; empty: "none-yet" | "waiting" | "all-done" | null } {
  // Only claim nothing has run when nothing has — over every task this role owns, not over the
  // ones still waiting. With work in the queue to explain, and none of it yet touched.
  const banner = x.startedMine === 0 && x.mineQueued > 0 ? "never-run" : null;

  const empty =
    x.mineQueued > 0
      ? null
      : x.totalQueued > 0
        ? "waiting"
        : x.startedVisible > 0
          ? "all-done"
          : "none-yet";

  return { banner, empty };
}

/** role code → "PM agent", for the line under a card's button. */
async function agentLabels(actor: Actor): Promise<Map<string, string>> {
  const sb = supabaseAdmin();
  if (!sb) return new Map();
  const { data } = await sb
    .from("role")
    .select("code,label,agent")
    .eq("org_id", actor.orgId);
  return new Map(
    (data ?? [])
      .filter((r) => r.agent)
      .map((r) => [r.code as string, `${r.label} agent`]),
  );
}

/**
 * Start a task. Nothing starts itself.
 *
 * Goes through the `start_task` routine rather than an update, so the actor is recorded and a
 * second click is refused rather than silently doing nothing. The event is written by a trigger
 * either way — this is the front door, not the only door.
 */
export async function startTask(
  actor: Actor,
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  // Confirm the task is inside this actor's scope BEFORE starting it. Without this, a task id
  // from another engagement would start perfectly happily — the routine only checks state.
  const mine = await tasksFor(actor, { includeClosed: true });
  if (!mine.some((t) => t.id === taskId)) {
    return { ok: false, error: "That task is not in your queue." };
  }

  // The Ready/depends_on gate, checked HERE rather than inside `start_task`'s SQL — see
  // `start-gate.ts` for why. This is the only caller of the RPC (phases.ts's machine-row
  // auto-start calls this function, not the RPC), so it is the single enforcement point.
  const blockers = await unmetToStart(actor, taskId);
  const blocked = describeBlockers(blockers);
  if (blocked) {
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.start_refused",
      actorRoleCode: actor.roleCode,
      actorUserId: actor.holder ?? null,
      reason: blocked,
      payload: {
        gate: blockers.some((b) => b.kind === "ready") ? "ready" : "depends_on",
      },
    });
    return { ok: false, error: blocked };
  }

  const { error } = await sb.rpc("start_task", {
    p_task_id: taskId,
    p_actor: actor.holder ?? actor.roleCode,
    p_actor_role: actor.roleCode,
  });
  if (error) {
    // The gate above passed, so a refusal here is a race (someone else started it a moment ago)
    // or a genuine DB error — not a Ready/depends_on question, so it is reported as-is rather than
    // classified into a gate the check above already cleared.
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.start_refused",
      actorRoleCode: actor.roleCode,
      actorUserId: actor.holder ?? null,
      reason: error.message,
      payload: { gate: "state" },
    });
    return { ok: false, error: error.message };
  }

  await pinInputs(taskId, actor.engagementId);

  return { ok: true };
}

/** What has happened on this engagement, newest first — the record, not a reconstruction. */
export async function recentEvents(actor: Actor, limit = 20) {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const { data } = await sb
    .from("event")
    .select(
      "verb, actor_kind, actor_user_id, actor_role_code, subject_type, occurred_at, payload",
    )
    .eq("engagement_id", actor.engagementId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
