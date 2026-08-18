// Ask the connectors whether they answer — the same check the Ready gate now performs.

import { NextRequest, NextResponse } from "next/server";
import { resolveActor, rolesOnEngagement } from "@/app/lib/data/actor";
import { checkConnectors } from "@/app/lib/data/gates";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { engagement, role } = await req.json();
  const roles = await rolesOnEngagement(engagement);
  const actor = await resolveActor(engagement, role ?? roles.find((r) => r.holder)?.code ?? "");
  if (!actor) return NextResponse.json({ error: "no such role on this engagement" }, { status: 400 });

  return NextResponse.json({ checks: await checkConnectors(actor) });
}
