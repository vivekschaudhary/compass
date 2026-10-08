// Run the agent for one task, one turn.
//
// A route rather than a server action because a real run takes minutes: it keeps the long request
// out of the render path, and anything can call it.
//
// DETACHED. This used to `await runAgent` and send its outcome back in the response — the request
// stayed open for however long the model took, and the response WAS the run's own result ("asked 2
// questions", "drafted 6 sections"). That made "the fetch resolved" the only signal the client had
// for "the run finished", which is exactly backwards once a page can be reopened mid-run from a
// different tab or a reload: the outcome has to live in the row (`work_task`, its turns), read
// however the page happens to load, not in a response only the tab that made the request ever sees.
//
// So this responds the moment the claim is accepted, not when the run is done. `runAgent` keeps
// doing everything it already did — the claim, the heartbeat, the backoff, filing the draft, writing
// the turn — none of that changed; it just no longer has anyone waiting on its return value. The
// page's own running/stalled state (heartbeat-driven) and the realtime channel are what tell the
// story from here.

import { NextRequest } from "next/server";
import { resolveActor } from "@/app/lib/data/actor";
import { runAgent } from "@/app/lib/agent/run";
import { detach } from "@/app/lib/agent/detach";
import { notifyRunEnded } from "@/app/lib/agent/notify-run-ended";
import { ok, refuse } from "@/app/lib/http";

export const maxDuration = 800;

export async function POST(req: NextRequest) {
  const { engagement, role, taskId, holderId } = await req.json();
  const actor = await resolveActor(engagement, role, holderId);
  if (!actor) return refuse("no such role on this engagement", 400);

  // The outcome is logged here, not only written to the row. A run that returns an error without
  // writing a turn would otherwise stop with nothing on the page and nothing in the console.
  const started = Date.now();
  console.log(`[agent-run] start task=${taskId} role=${role}`);
  detach(async () => {
    const outcome = await runAgent(actor, taskId);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (outcome.kind === "error") {
      console.error(`[agent-run] error task=${taskId} after ${secs}s: ${outcome.message}`);
    } else {
      console.log(`[agent-run] ${outcome.kind} task=${taskId} after ${secs}s`);
    }
    await notifyRunEnded(taskId);
    return outcome;
  });
  return ok({ kind: "accepted" as const, taskId });
}
