// What is happening right now, for a client that is waiting.
//
// A GET route rather than a server action: actions are POSTs that React queues behind the one
// already in flight, so a progress poll issued during `initiatePhaseAction` would not answer until
// the thing it is reporting on had finished. A plain route runs alongside it.

import { NextRequest } from "next/server";
import { resolveActor, rolesOnEngagement } from "@/app/lib/data/actor";
import { progressSince } from "@/app/lib/data/progress";
import { ok, refuse } from "@/app/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const engagement = url.searchParams.get("engagement");
  const since = url.searchParams.get("since");
  if (!engagement || !since) {
    return refuse("engagement and since are required", 400);
  }

  const role = url.searchParams.get("role");
  const roles = await rolesOnEngagement(engagement);
  const actor = await resolveActor(engagement, role ?? roles.find((r) => r.holder)?.code ?? "");
  if (!actor) return refuse("no such role on this engagement", 400);

  return ok({ lines: await progressSince(actor, since) });
}
