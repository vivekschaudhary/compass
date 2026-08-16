// Run the agent for one task, one turn.
//
// A route rather than a server action because a real run takes minutes: it keeps the long request
// out of the render path, and anything can call it.

import { NextRequest, NextResponse } from "next/server";
import { resolveActor } from "@/app/lib/data/actor";
import { runAgent } from "@/app/lib/agent/run";

export const maxDuration = 800;

export async function POST(req: NextRequest) {
  const { engagement, role, taskId } = await req.json();
  const actor = await resolveActor(engagement, role);
  if (!actor) return NextResponse.json({ error: "no such role on this engagement" }, { status: 400 });

  const outcome = await runAgent(actor, taskId);
  return NextResponse.json(outcome);
}
