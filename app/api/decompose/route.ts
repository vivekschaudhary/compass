import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { logActivity } from "@/app/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DEpic = {
  deliverable_code: string;
  title: string;
  discipline: "Product" | "Engineering" | "QA" | "Design";
  phase: "Discovery" | "Build" | "QA" | "Launch";
  stories: { title: string; estimate_pts: number }[];
};

const SYSTEM = `You are Compass's PM agent. Decompose a set of SOW deliverables into a delivery plan.
Return ONLY valid JSON — no markdown, no prose — with this shape:
{"epics":[{"deliverable_code":"D2","title":string,"discipline":"Product"|"Engineering"|"QA"|"Design","phase":"Discovery"|"Build"|"QA"|"Launch","stories":[{"title":string,"estimate_pts":number}]}]}
Rules:
- Each epic grounds to exactly ONE deliverable_code (must be one of the provided codes).
- Stories are FUNCTIONAL (the user-observable *what*), never technical.
- A UI/build deliverable typically gets an Engineering epic (+2–4 stories), and often a Design and a QA epic.
- Right-size it: 1–3 epics per deliverable, 2–4 stories each. Do NOT invent scope beyond the deliverables.
- Sequence phases sensibly (Discovery early, Launch last).`;

const LEAD: Record<string, string> = { Product: "Jen Okafor", Engineering: "Maria Santos", QA: "Priya Nair", Design: "Alex Ree" };

function parseJson(text: string) {
  const c = text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(c.slice(c.indexOf("{"), c.lastIndexOf("}") + 1));
}

function prefix(name: string) {
  const p = name.split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join("").toUpperCase();
  return p.length >= 2 ? p : "PRJ";
}

const TEAM = [
  { role: "exec", name: "Dana Whit", initials: "DW", title: "Delivery Exec" },
  { role: "pm", name: "Jen Okafor", initials: "JO", title: "Product Manager" },
  { role: "eng", name: "Maria Santos", initials: "MS", title: "Engineer" },
  { role: "qa", name: "Priya Nair", initials: "PN", title: "QA Engineer" },
  { role: "design", name: "Alex Ree", initials: "AR", title: "Designer" },
];

export async function POST(req: Request) {
  const { engagementId, actor } = (await req.json()) as { engagementId: string; actor?: string };
  const sb = supabaseAdmin();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 400 });
  if (!key) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 400 });

  const { data: eng } = await sb.from("engagement").select("*").eq("id", engagementId).maybeSingle();
  const { data: dels } = await sb.from("deliverable").select("*").eq("engagement_id", engagementId).order("ord");
  if (!eng || !dels?.length) return NextResponse.json({ ok: false, error: "engagement/deliverables not found" }, { status: 400 });

  // PM agent decomposes
  const client = new Anthropic({ apiKey: key });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const delList = dels.map((d) => `${d.code}: ${d.title} — ${d.acceptance}`).join("\n");
  const msg = await client.messages.create({
    model, max_tokens: 3000, system: SYSTEM,
    messages: [{ role: "user", content: `Engagement: ${eng.name} (${eng.client})\nDeliverables:\n${delList}` }],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let epics: DEpic[];
  try { epics = parseJson(text).epics; } catch { return NextResponse.json({ ok: false, error: "could not parse plan" }, { status: 400 }); }

  const codes = new Set(dels.map((d) => d.code));
  epics = epics.filter((e) => codes.has(e.deliverable_code));

  // clear any prior plan for this engagement, then insert fresh
  await sb.from("epic").delete().eq("engagement_id", engagementId);
  await sb.from("job").delete().eq("engagement_id", engagementId);

  const pfx = prefix(eng.name);
  const epicRows: Record<string, unknown>[] = [];
  const storyRows: Record<string, unknown>[] = [];
  let en = 10, sn = 100;
  for (const e of epics) {
    const epicId = `${pfx}-${en++}`;
    epicRows.push({ id: epicId, engagement_id: engagementId, title: e.title, deliverable_code: e.deliverable_code, discipline: e.discipline, phase: e.phase, status: "idle", ord: en });
    for (const s of e.stories ?? []) {
      storyRows.push({ id: `${pfx}-${sn++}`, epic_id: epicId, title: s.title, assignee: (LEAD[e.discipline] ?? "—").split(" ")[0], status: "idle", estimate_pts: s.estimate_pts ?? 3, ac_pass_pct: 0 });
    }
  }
  if (epicRows.length) await sb.from("epic").insert(epicRows);
  if (storyRows.length) await sb.from("story").insert(storyRows);

  // seed the team if none
  const { data: mems } = await sb.from("member").select("id").eq("engagement_id", engagementId).limit(1);
  if (!mems?.length) {
    await sb.from("member").insert(TEAM.map((m) => ({ id: `${engagementId}-m-${m.role}`, engagement_id: engagementId, ...m })));
  }

  // PM review jobs — one per deliverable now decomposed
  const jobs = dels.map((d, i) => ({
    id: `${engagementId}-j-${d.code}`, engagement_id: engagementId, role: "pm", kind: "review",
    title: `Review stories — ${d.title}`, subtitle: `Your PM agent decomposed ${d.code} into functional stories. Review + approve them into the plan.`,
    meta: "AI-decomposed", related: d.code, primary_label: "Review", secondary_label: "Approve all", tone: "default", ord: i + 1,
  }));
  if (jobs.length) await sb.from("job").insert(jobs);

  await logActivity(sb, { engagementId, role: "pm", actor, kind: "decompose", title: `Decomposed ${dels.length} deliverables → ${epicRows.length} epics · ${storyRows.length} stories`, related: eng.name });

  return NextResponse.json({ ok: true, epics: epicRows.length, stories: storyRows.length, jobs: jobs.length });
}
