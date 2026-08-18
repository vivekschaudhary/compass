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

  const { data: eng } = await sb.from("engagement").select("org_id").eq("id", e.engagementId).maybeSingle();

  const { error } = await sb.from("event").insert({
    org_id: (eng as { org_id?: string } | null)?.org_id ?? null,
    engagement_id: e.engagementId,
    subject_type: e.subjectType,
    subject_id: e.subjectId,
    verb: e.verb,
    actor_kind: e.actorKind,
    actor_role_code: e.actorRoleCode ?? null,
    actor_user_id: e.actorUserId ?? null,
    payload: e.payload ?? {},
    occurred_at: new Date().toISOString(),
  });
  // Logged, not thrown — see the note at the top of this file.
  if (error) console.error("[event] could not record", e.verb, e.subjectId, error.message);
}

/** Several at once, in order, without making each caller await in a loop. */
export async function emitAll(events: Emit[]): Promise<void> {
  for (const e of events) await emit(e);
}
