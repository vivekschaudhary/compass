// Adopt v1's scaffolded doc tree into the v2 `document` table.
//
// A separate, explicit act rather than something the app does on first render. It is a migration,
// it is idempotent, and it should be visible when it happens.
//
//   POST /api/v2/content/adopt?engagementId=<id>

import { NextResponse } from "next/server";
import { adoptV1DocTree } from "@/app/lib/data/documents";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const engagementId = new URL(req.url).searchParams.get("engagementId");
  if (!engagementId) {
    return NextResponse.json({ ok: false, error: "engagementId is required." }, { status: 400 });
  }
  try {
    const result = await adoptV1DocTree(engagementId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
