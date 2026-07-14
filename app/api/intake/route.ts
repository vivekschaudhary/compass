import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { scaffoldDocs } from "@/app/lib/doctree";
import { seedEngagementMetrics } from "@/app/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Extracted = {
  name: string;
  client: string;
  sow: string;
  pricing: "Fixed-bid" | "T&M";
  budget: number;
  months: number;
  quality_bar: string;
  deliverables: { code: string; title: string; acceptance: string }[];
};

const SYSTEM = `You are Compass's intake analyst. Extract a Statement of Work into a structured delivery engagement.
Return ONLY valid JSON — no markdown, no prose — with this exact shape:
{"name":string,"client":string,"sow":string,"pricing":"Fixed-bid"|"T&M","budget":number,"months":number,"quality_bar":string,
 "deliverables":[{"code":"D1","title":string,"acceptance":string}]}
Rules: be faithful to the SOW — do NOT invent scope or deliverables it doesn't imply. Number deliverables D1..Dn.
budget is an integer in USD (0 if not stated). months is an integer best-estimate. Keep any inference conservative and clearly bounded.`;

function parseJson(text: string): Extracted {
  const cleaned = text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function analyze(sow: string): Promise<Extracted> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set — add it to .env.local to analyze a SOW.");
  const client = new Anthropic({ apiKey: key });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const msg = await client.messages.create({
    model, max_tokens: 1500, system: SYSTEM,
    messages: [{ role: "user", content: `Statement of Work:\n\n${sow}` }],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return parseJson(text);
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 18);
}

export async function POST(req: Request) {
  const body = (await req.json()) as { mode: "analyze" | "create"; sow?: string; data?: Extracted };

  if (body.mode === "analyze") {
    try {
      const data = await analyze(body.sow ?? "");
      return NextResponse.json({ ok: true, data });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "analyze failed" }, { status: 400 });
    }
  }

  // create
  const sb = supabaseAdmin();
  const d = body.data;
  if (!sb || !d) return NextResponse.json({ ok: false, error: "not configured" }, { status: 400 });

  const suffix = Date.now().toString(36).slice(-4);
  const id = `${slug(d.client || d.name || "engagement")}-${suffix}`;
  const days = Math.max(7, Math.round((d.months || 3) * 30));

  const { error: e1 } = await sb.from("engagement").insert({
    id, name: d.name, client: d.client, sow: d.sow, pricing: d.pricing,
    budget: d.budget, months: d.months, quality_bar: d.quality_bar,
    phase: "Kickoff · Phase 1", overall: "good",
    cost_budget: d.budget, cost_spent: 0, cost_spark: [0],
    scope_spark: [], time_milestone: "Kickoff", time_days_left: days, stories_late: 0, time_spark: [],
    quality_ac_pass: 100, quality_criticals: 0, quality_spark: [],
  });
  if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 400 });

  const rows = (d.deliverables || []).map((x, i) => ({
    id: `${id}-${x.code || "D" + (i + 1)}`, engagement_id: id,
    code: x.code || `D${i + 1}`, title: x.title, acceptance: x.acceptance, status: "planned", ord: i + 1,
  }));
  if (rows.length) await sb.from("deliverable").insert(rows);

  // scaffold the standard Confluence doc tree (records structure; creates for real if a space is wired)
  await scaffoldDocs(id);
  // capture the SOW-level product + engineering metric definitions
  await seedEngagementMetrics(sb, id);

  return NextResponse.json({ ok: true, engagementId: id, deliverables: rows.length });
}
