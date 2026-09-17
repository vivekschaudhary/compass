// Start an engagement.

import { NextRequest } from "next/server";
import { createEngagement, type NewEngagement } from "@/app/lib/data/onboard";
import { refuse, respond } from "@/app/lib/http";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as NewEngagement;
  if (!body?.name?.trim()) return refuse("name is required", 400);
  // A refusal is a 422 now, not a 200 with an empty id — see `lib/envelope.ts`.
  return respond(await createEngagement(body));
}
