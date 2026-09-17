// Run the agent for one task, one turn.
//
// A route rather than a server action because a real run takes minutes: it keeps the long request
// out of the render path, and anything can call it.

import { NextRequest } from "next/server";
import { resolveActor } from "@/app/lib/data/actor";
import { runAgent } from "@/app/lib/agent/run";
import { ok, refuse, fail } from "@/app/lib/http";

export const maxDuration = 800;

export async function POST(req: NextRequest) {
  const { engagement, role, taskId } = await req.json();
  const actor = await resolveActor(engagement, role);
  if (!actor) return refuse("no such role on this engagement", 400);

  const outcome = await runAgent(actor, taskId);
  // `AgentOutcome` is a domain result and keeps its `kind`: asked, drafted and refused are all runs
  // that happened. Only `kind: "error"` leaves that vocabulary, because it is the one outcome that
  // must not arrive as a 200. It mixes refusals ("that task is not in your engagement") with real
  // failures (the model call threw) under one kind, so it is sent as a failure; telling them apart
  // belongs in `runAgent`, not here.
  if (outcome.kind === "error") return fail(outcome.message);
  return ok(outcome);
}
