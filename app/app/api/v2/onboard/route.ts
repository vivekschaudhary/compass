// Start an engagement.

import { NextRequest, NextResponse } from "next/server";
import { createEngagement, type NewEngagement } from "@/app/lib/data/onboard";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as NewEngagement;
  if (!body?.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  return NextResponse.json(await createEngagement(body));
}
