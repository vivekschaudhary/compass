import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sprint review / demo — the Product Owner's end-of-sprint report: delivered vs the backlog, the
// four-pillar snapshot, and the next focus. Computed from the current story + engagement state
// (honest — what actually shipped), mirroring compass's sprint-review template.
export async function GET(req: Request) {
  const engagementId = new URL(req.url).searchParams.get("engagementId");
  const sb = supabaseAdmin();
  if (!sb || !engagementId) return NextResponse.json({ ok: false, error: "missing engagement" }, { status: 400 });

  const { data: eng } = await sb.from("engagement").select("*").eq("id", engagementId).maybeSingle();
  if (!eng) return NextResponse.json({ ok: false, error: "engagement not found" }, { status: 404 });

  const { data: epics } = await sb.from("epic").select("id,title").eq("engagement_id", engagementId);
  const epicIds = (epics ?? []).map((e) => e.id);
  const { data: stories } = epicIds.length
    ? await sb.from("story").select("id,title,status,estimate_pts").in("epic_id", epicIds)
    : { data: [] as { id: string; title: string; status: string; estimate_pts: number }[] };

  const all = stories ?? [];
  const done = (s: string) => s === "done" || s === "good";
  const delivered = all.filter((s) => done(s.status));
  const next = all.filter((s) => s.status === "ready" || s.status === "idle").slice(0, 8);
  const pts = (list: typeof all) => list.reduce((n, s) => n + (s.estimate_pts || 0), 0);

  const costPct = Math.round((eng.cost_spent / Math.max(eng.cost_budget, 1)) * 100);
  return NextResponse.json({
    ok: true,
    review: {
      phase: eng.phase,
      delivered: delivered.map((s) => ({ id: s.id, title: s.title, pts: s.estimate_pts || 0 })),
      deliveredPts: pts(delivered),
      totalStories: all.length,
      inProgress: all.filter((s) => s.status === "in-progress").length,
      next: next.map((s) => ({ id: s.id, title: s.title, pts: s.estimate_pts || 0 })),
      pillars: {
        cost: `$${Math.round(eng.cost_spent / 1000)}k / $${Math.round(eng.cost_budget / 1000)}k · ${costPct}%`,
        scope: `${(eng.scope_spark?.slice(-1)[0] ?? delivered.length)} delivered`,
        time: `${eng.time_milestone} · ${eng.time_days_left}d left · ${eng.stories_late} late`,
        quality: `${eng.quality_ac_pass}% AC · ${eng.quality_criticals} criticals`,
      },
    },
  });
}
