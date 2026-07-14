import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/app/lib/supabase";
import { resolveJira, createIssue } from "@/app/lib/jira";
import { streamExecution } from "@/app/lib/exec";
import { seedEngagementMetrics, seedEpicMetrics } from "@/app/lib/metrics";
import { normalizeRole } from "@/app/lib/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a bet from a short brief — the in-app analog of create-brief → create-story.
// A PM agent turns the brief into ONE epic (the bet) + functional stories, grounded to a
// deliverable, written straight to the backlog. Downstream Build still runs the real orchestrator.
const SYSTEM = `You are Compass's PM agent creating ONE bet (a coherent slice of product value) from a short brief.
Return ONLY valid JSON — no markdown, no prose — with this shape:
{"epic":{"title":string,"discipline":"Product"|"Engineering"|"QA"|"Design","phase":"Discovery"|"Build"|"QA"|"Launch"},
 "stories":[{"title":string,"role":"researcher"|"designer"|"ux-writer"|"engineer"|"automation","estimate_pts":number}]}
Rules:
- The epic IS the bet. Produce 3–6 FUNCTIONAL stories — the user-observable *what*, never technical tasks.
- Give each story the ONE delivery role that owns it. If the bet needs discovery, include ONE "researcher" story FIRST.
- Spread roles when the bet genuinely needs design/copy/QA, not only engineering.
- Right-size estimates (1–8 pts). Do NOT invent scope beyond what the brief implies.`;

function parseJson(t: string) {
  const c = t.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(c.slice(c.indexOf("{"), c.lastIndexOf("}") + 1));
}
function prefix(name: string) {
  const p = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return p.length >= 2 ? p : "BET";
}
const DISCIPLINES = ["Product", "Engineering", "QA", "Design"];
const PHASES = ["Discovery", "Build", "QA", "Launch"];

export async function POST(req: Request) {
  const { engagementId, title, brief, deliverableCode, actor } = (await req.json().catch(() => ({}))) as
    { engagementId?: string; title?: string; brief?: string; deliverableCode?: string; actor?: string };

  return streamExecution({ engagementId: engagementId ?? "", role: "pm", kind: "bet", actor }, async (step) => {
    const sb = supabaseAdmin();
    const key = process.env.ANTHROPIC_API_KEY;
    if (!sb) throw new Error("Supabase not configured");
    if (!key) throw new Error("ANTHROPIC_API_KEY not set");
    if (!title?.trim()) throw new Error("An epic title is required");

    const { data: eng } = await sb.from("engagement")
      .select("name, atlassian_base_url, atlassian_email, atlassian_api_token, jira_project").eq("id", engagementId).maybeSingle();

    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    step(`▸ PM agent drafting the epic (${model})…`);
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model, max_tokens: 2000, system: SYSTEM,
      messages: [{ role: "user", content: `Bet title: ${title}\nBrief: ${brief?.trim() || "(none — infer a sensible minimal slice from the title)"}\nGrounds to deliverable: ${deliverableCode || "(none)"}` }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    let plan: { epic?: { title?: string; discipline?: string; phase?: string }; stories?: { title: string; role?: string; estimate_pts?: number }[] };
    try { plan = parseJson(text); } catch { throw new Error("Could not parse the plan"); }

    const epicTitle = plan.epic?.title || title;
    const disc = DISCIPLINES.includes(plan.epic?.discipline ?? "") ? plan.epic!.discipline! : "Engineering";
    const phase = PHASES.includes(plan.epic?.phase ?? "") ? plan.epic!.phase! : "Build";
    const storyPlans = (plan.stories ?? []).slice(0, 8);
    step(`✓ epic: ${epicTitle} (${disc} · ${phase}) — ${storyPlans.length} stories`);

    const jira = resolveJira(eng ?? {});
    let epicId = "", storyIds: string[] = [], jiraCreated = false;
    if (jira) {
      step(`▸ creating Jira Epic…`);
      const ep = await createIssue(jira, { type: "Epic", summary: epicTitle, description: brief?.trim() || epicTitle });
      if (ep) {
        epicId = ep.key; jiraCreated = true;
        step(`  ✓ ${epicId}`);
        step(`▸ creating ${storyPlans.length} Stories under ${epicId}…`);
        const created = await Promise.all(storyPlans.map((s) => createIssue(jira, { type: "Story", summary: s.title, parentKey: epicId, labels: [normalizeRole(s.role)] })));
        storyIds = created.map((r) => r?.key ?? "");
        created.forEach((r, i) => step(`  ✓ ${r?.key ?? "(local)"} — ${storyPlans[i].title} · ${normalizeRole(storyPlans[i].role)}`));
      }
    }
    if (!epicId) {
      step(`▸ Jira not wired — using local ids…`);
      const pfx = prefix(eng?.name || "Bet");
      const { data: eids } = await sb.from("epic").select("id").eq("engagement_id", engagementId);
      const nums = (eids ?? []).map((e) => parseInt(String(e.id).split("-").pop() || "0", 10)).filter((n) => !isNaN(n));
      const en = Math.max(100, 0, ...nums) + 1;
      epicId = `${pfx}-${en}`;
      let sn = en * 10;
      storyIds = storyPlans.map(() => `${pfx}-${sn++}`);
    }

    step(`▸ mirroring to the board…`);
    const { data: existing } = await sb.from("epic").select("id").eq("engagement_id", engagementId);
    await sb.from("epic").insert({
      id: epicId, engagement_id: engagementId, title: epicTitle,
      deliverable_code: deliverableCode || null, discipline: disc, phase, status: "idle",
      note: brief?.trim() ? brief.trim().slice(0, 160) : null, ord: (existing?.length ?? 0) + 1,
    });
    const stories = storyPlans
      .map((s, i) => ({ id: storyIds[i], epic_id: epicId, title: s.title, assignee: "—", status: "idle", estimate_pts: s.estimate_pts ?? 3, ac_pass_pct: 0, role: normalizeRole(s.role) }))
      .filter((s) => s.id);
    if (stories.length) await sb.from("story").insert(stories);
    await seedEngagementMetrics(sb, engagementId!);
    await seedEpicMetrics(sb, engagementId!, epicId);
    step(`✓ ${epicId} + ${stories.length} stories on the board · metrics captured`);

    return { result: { ok: true, epic: epicId, epicTitle, stories: stories.length, jira: jiraCreated }, title: `Created epic — ${epicTitle}`, related: epicId };
  });
}
