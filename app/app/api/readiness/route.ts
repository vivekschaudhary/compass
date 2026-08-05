import { NextResponse } from "next/server";
import { engagementReadiness } from "@/app/lib/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?engagementId=… → Phase A readiness (see compass/framework/engagement-setup.md).
// Read-only and probe-based: it reads the Confluence space / Graph site and the Jira project's
// statuses. It never writes, so it is safe to poll from a settings screen.
export async function GET(req: Request) {
  const engagementId = new URL(req.url).searchParams.get("engagementId") ?? "";
  if (!engagementId) return NextResponse.json({ ok: false, error: "engagementId required" }, { status: 400 });
  const readiness = await engagementReadiness(engagementId);
  return NextResponse.json({ ok: true, readiness });
}
