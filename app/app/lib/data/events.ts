// The event log — what actually happened, written where it happens.
//
// It existed before this file, but only two database triggers wrote to it: one on `work_task` state
// and one on `document` publication. So the log could say a task REACHED hitl and later REACHED
// closed, and nothing about what was checked, by what, with what verdict, who attested to it, what
// they rejected and why, what the agent was asked, or what it cost. Answering "why did this close"
// meant joining four tables and replaying the UI in a browser.
//
// That is backwards for a product whose whole claim is that the record falls out of execution
// rather than being assembled afterwards. Every consequential write now emits beside itself.
//
// Deliberately fire-and-forget: an event that fails must never cost the thing it describes. A
// missing line in the log is a gap; a measurement lost because its log line failed is a lie.

import "server-only";
import { supabaseAdmin } from "../supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The org an engagement belongs to.
 *
 * NOT a column on `engagement` — that was the assumption behind four events written with a null
 * org, which the trigger-written ones beside them carried correctly. Tasks carry it, and every
 * engagement that has done anything has tasks; the single-org fallback covers the gap before the
 * first one exists.
 */
export async function orgIdFor(engagementId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: task } = await sb.from("work_task")
    .select("org_id").eq("engagement_id", engagementId).limit(1).maybeSingle();
  if (task?.org_id) return task.org_id as string;

  const { data: doc } = await sb.from("document")
    .select("org_id").eq("engagement_id", engagementId).limit(1).maybeSingle();
  if (doc?.org_id) return doc.org_id as string;

  const { data: org } = await sb.from("org").select("id").eq("code", "default").maybeSingle();
  return (org?.id as string) ?? null;
}

export type Emit = {
  engagementId: string;
  /** What the event is about — `criterion`, `question`, `task`, `document`, `agent_run`. */
  subjectType: string;
  subjectId: string;
  /** Past tense, always. Events record what happened, not what should. */
  verb: string;
  actorKind: "human" | "agent" | "system";
  actorRoleCode?: string | null;
  actorUserId?: string | null;
  /** Enough to reconstruct the moment without opening another table. */
  payload?: Record<string, unknown>;
};

export async function emit(e: Emit): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;

  const { error } = await sb.from("event").insert({
    org_id: await orgIdFor(e.engagementId),
    engagement_id: e.engagementId,
    subject_type: e.subjectType,
    // `subject_id` is a uuid column, and not every subject has a uuid — an engagement's id is text
    // (`nimbus-health-4ogm`). Passing it produced "invalid input syntax for type uuid" and, because
    // emitting is fire-and-forget, dropped the event with only a console line to show for it. A
    // non-uuid subject keeps its id in the payload, where it is still queryable.
    subject_id: UUID.test(e.subjectId) ? e.subjectId : null,
    verb: e.verb,
    actor_kind: e.actorKind,
    actor_role_code: e.actorRoleCode ?? null,
    actor_user_id: e.actorUserId ?? null,
    payload: UUID.test(e.subjectId) ? (e.payload ?? {}) : { ...(e.payload ?? {}), subject: e.subjectId },
    occurred_at: new Date().toISOString(),
  });
  // Logged, not thrown — see the note at the top of this file.
  if (error) console.error("[event] could not record", e.verb, e.subjectId, error.message);
}

/** Several at once, in order, without making each caller await in a loop. */
export async function emitAll(events: Emit[]): Promise<void> {
  for (const e of events) await emit(e);
}

/**
 * Record that the system said NO.
 *
 * A gate refusing is the most informative thing that happens in this product and the least
 * recorded. State CHANGES are evented by a trigger, so a task that starts leaves a trace and a task
 * that could not start leaves nothing — which means the one question worth asking of the record,
 * *where does this process actually block*, has no data behind it.
 *
 * MUST BE CALLED AFTER THE FAILED CALL RETURNS, never inside the transaction that refused. The
 * refusals live in Postgres routines and `raise exception` rolls the transaction back — an event
 * written on that path would be rolled back with it and the refusal would still be invisible. That
 * is the whole reason this is a caller's job rather than a trigger's.
 *
 * `reason` is the refusal verbatim. The routines already explain themselves ("Waiting on: Staffing
 * plan and resources"), and paraphrasing loses the part someone needs.
 */
export async function emitRefusal(r: {
  engagementId: string;
  subjectType: string;
  subjectId: string;
  /** Past tense and specific: `phase.refused`, `task.start_refused`, `task.close_refused`. */
  verb: string;
  actorRoleCode?: string | null;
  actorUserId?: string | null;
  reason: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await emit({
    engagementId: r.engagementId,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    verb: r.verb,
    // The gate refused, not the person. Someone asking why their close bounced is looking for the
    // rule, and attributing it to them sends them to the wrong question.
    actorKind: "system",
    actorRoleCode: r.actorRoleCode ?? null,
    actorUserId: r.actorUserId ?? null,
    payload: { ...(r.payload ?? {}), reason: r.reason },
  });
}
