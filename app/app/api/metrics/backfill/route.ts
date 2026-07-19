import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { seedEngagementMetrics, seedEpicMetrics } from "@/app/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Capture the metric definitions for an existing engagement + all its epics (idempotent).
export async function POST(req: Request) {
  const { engagementId } = (await req.json().catch(() => ({}))) as { engagementId?: string };
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 400 });
  if (!engagementId) return NextResponse.json({ ok: false, error: "engagementId required" }, { status: 400 });

  await seedEngagementMetrics(sb, engagementId);
  const { data: epics } = await sb.from("epic").select("id").eq("engagement_id", engagementId);
  for (const e of epics ?? []) await seedEpicMetrics(sb, engagementId, e.id);

  const { data: metrics } = await sb.from("metric").select("id").eq("engagement_id", engagementId);
  return NextResponse.json({ ok: true, epics: (epics ?? []).length, metrics: (metrics ?? []).length });
}
