// What a long-running action is doing, while it does it.
//
// Initiating a phase takes the better part of a minute on a real engagement — thirteen rows, each
// probing Confluence AND Jira, then fourteen issues created on the board. The button sat disabled
// and silent for all of it, which is indistinguishable from a hang. The first thing anyone did was
// click again.
//
// The messages are READ FROM THE EVENT LOG, not invented on a timer. That distinction is the whole
// product: a spinner cycling "Setting things up… Almost there…" is status theater, and inventing
// reassurance in the one place a user is actually watching is the habit Compass exists to replace.
// If the log is silent, this says nothing rather than filling the gap.
//
// It follows that the feed costs nothing to produce. `emit` already writes beside every
// consequential step; this only reads what is there.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./actor";

export type ProgressLine = {
  at: string;
  /** One sentence, already human-readable. */
  line: string;
};

/**
 * Turn an event into the sentence a person watching would want.
 *
 * `detail` is preferred wherever it exists because it carries what actually happened — "Confluence
 * space Test1 answered" beats "checked a criterion". The verb is the fallback, not the source.
 */
function lineFor(verb: string, payload: Record<string, unknown> | null): string | null {
  const p = payload ?? {};
  const detail = typeof p.detail === "string" ? p.detail : null;
  const n = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : null);

  switch (verb) {
    case "workflow.opened":
      return `Opened the run`;
    case "phase.initiated":
      return `Created ${n("rows") ?? n("tasks") ?? "the"} rows`;
    case "task.created":
      return typeof p.title === "string" ? `Queued “${p.title}”` : null;
    // The probes, and the reason this is worth showing at all: they are the slow part, and each one
    // names the system it just reached.
    case "criterion.met":
      return detail;
    case "criterion.unmet":
      // Not a failure to hide. A Done criterion that is unmet on a row nobody has worked yet is the
      // expected state, and showing it is how someone learns the gate is real.
      return detail;
    case "tracker.mirrored": {
      const stories = n("stories");
      const epic = typeof p.epic === "string" ? p.epic : null;
      return epic ? `Filed ${epic} and ${stories ?? 0} stories on the board` : null;
    }
    case "phase.refused":
      return typeof p.reason === "string" ? `Refused: ${p.reason}` : "Refused";
    case "task.start_refused":
    case "task.close_refused":
      return typeof p.reason === "string" ? `Could not proceed: ${p.reason}` : null;
    default:
      return null;
  }
}

/**
 * Everything logged for this engagement since a moment, oldest first.
 *
 * Scoped by engagement through the Actor, like every other read here — a progress feed is not a
 * place the rules relax.
 */
export async function progressSince(
  actor: Actor,
  sinceIso: string,
  limit = 40,
): Promise<ProgressLine[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data } = await sb
    .from("event")
    .select("verb, payload, occurred_at")
    .eq("engagement_id", actor.engagementId)
    .gt("occurred_at", sinceIso)
    .order("occurred_at", { ascending: true })
    .limit(limit);

  const out: ProgressLine[] = [];
  for (const e of data ?? []) {
    const line = lineFor(e.verb as string, e.payload as Record<string, unknown> | null);
    // A verb with nothing worth saying is skipped, not padded into a sentence.
    if (line) out.push({ at: e.occurred_at as string, line });
  }
  return out;
}
