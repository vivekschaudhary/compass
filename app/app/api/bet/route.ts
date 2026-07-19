import { supabaseAdmin } from "@/app/lib/supabase";
import { resolveJira, createIssue } from "@/app/lib/jira";
import { streamExecution } from "@/app/lib/exec";
import { seedEngagementMetrics, seedEpicMetrics } from "@/app/lib/metrics";
import { normalizeRole } from "@/app/lib/lifecycle";
import { generate, AI_MODEL } from "@/app/lib/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a bet from a short brief — the in-app analog of create-brief → create-story.
// A PM agent turns the brief into ONE epic (the bet) + functional stories, grounded to a
// deliverable, written straight to the backlog. Downstream Build still runs the real orchestrator.
const SYSTEM = `You are Compass's PM agent creating ONE bet (a coherent slice of product value) from a short brief.
Return ONLY valid JSON — no markdown, no prose — with this shape:
{"epic":{"title":string,"description":string,"discipline":"Product"|"Engineering"|"QA"|"Design","phase":"Discovery"|"Build"|"QA"|"Launch"},
 "stories":[{"title":string,"role":"researcher"|"designer"|"ux-writer"|"engineer"|"automation","description":string,"acceptance":string,"estimate_pts":number}]}
Rules:
- The epic IS the bet. Produce 3–6 FUNCTIONAL stories — the user-observable *what*, never technical tasks.
- "epic.description": 2–3 sentences — the problem, who it's for, and the outcome.
- "story.description": 1–3 sentences — the user-observable what + why (never technical tasks).
- "story.acceptance": 2–4 acceptance criteria as short "Given/When/Then" lines, one per line.
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

// Compose a Jira Story description from the AI's what/why + its acceptance criteria (so the ticket
// isn't empty). Returns undefined when there's nothing — createIssue then omits the field.
function storyDescription(s: { description?: string; acceptance?: string }): string | undefined {
  const parts = [s.description?.trim(), s.acceptance?.trim() ? `Acceptance criteria:\n${s.acceptance.trim()}` : ""].filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}

export async function POST(req: Request) {
  const { engagementId, title, brief, deliverableCode, actor } = (await req.json().catch(() => ({}))) as
    { engagementId?: string; title?: string; brief?: string; deliverableCode?: string; actor?: string };

  return streamExecution({ engagementId: engagementId ?? "", role: "pm", kind: "bet", actor }, async (step) => {
    const sb = supabaseAdmin();
    if (!sb) throw new Error("Supabase not configured");
    if (!title?.trim()) throw new Error("An epic title is required");

    const { data: eng } = await sb.from("engagement")
      .select("name, atlassian_base_url, atlassian_email, atlassian_api_token, jira_project").eq("id", engagementId).maybeSingle();

    step(`▸ PM agent drafting the epic (${AI_MODEL})…`);
    const text = await generate({ system: SYSTEM, user: `Bet title: ${title}\nBrief: ${brief?.trim() || "(none — infer a sensible minimal slice from the title)"}\nGrounds to deliverable: ${deliverableCode || "(none)"}`, maxTokens: 2000 });
    let plan: { epic?: { title?: string; description?: string; discipline?: string; phase?: string }; stories?: { title: string; role?: string; description?: string; acceptance?: string; estimate_pts?: number }[] };
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
      const ep = await createIssue(jira, { type: "Epic", summary: epicTitle, description: plan.epic?.description?.trim() || brief?.trim() || epicTitle });
      if (ep) {
        epicId = ep.key; jiraCreated = true;
        step(`  ✓ ${epicId}`);
        step(`▸ creating ${storyPlans.length} Stories under ${epicId}…`);
        const created = await Promise.all(storyPlans.map((s) => createIssue(jira, { type: "Story", summary: s.title, parentKey: epicId, labels: [normalizeRole(s.role)], description: storyDescription(s) })));
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
      .map((s, i) => ({ id: storyIds[i], epic_id: epicId, title: s.title, assignee: "—", status: "idle", estimate_pts: s.estimate_pts ?? 3, ac_pass_pct: 0, role: normalizeRole(s.role), acceptance: s.acceptance?.trim() || null }))
      .filter((s) => s.id);
    if (stories.length) await sb.from("story").insert(stories);
    await seedEngagementMetrics(sb, engagementId!);
    await seedEpicMetrics(sb, engagementId!, epicId);
    step(`✓ ${epicId} + ${stories.length} stories on the board · metrics captured`);

    return { result: { ok: true, epic: epicId, epicTitle, stories: stories.length, jira: jiraCreated }, title: `Created epic — ${epicTitle}`, related: epicId };
  });
}
