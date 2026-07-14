import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/app/lib/supabase";
import { resolveJira, createIssue, transitionIssue } from "@/app/lib/jira";
import { streamExecution } from "@/app/lib/exec";
import { normalizeRole, STATUS } from "@/app/lib/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PO refine — gated on approved research. `propose` reads the approved findings + existing stories
// and streams the agent's reasoning, returning proposed stories (writes nothing → not persisted).
// `accept` creates the PO-selected stories under the epic — additive only, persisted as a run.
const SYSTEM = `You are Compass's refinement agent. Given approved research findings and the epic's EXISTING stories,
propose the NEW functional build stories the findings imply are now needed. Return ONLY valid JSON:
{"stories":[{"title": string, "acceptance": string, "points": number, "role":"engineer"|"designer"|"ux-writer"|"automation"}]}
- Functional stories (user-observable *what*), grounded in the findings. Right-size points (1–8).
- Give each story the ONE delivery role that owns it (default "engineer"; use design/copy/QA when the work calls for it).
- Do NOT duplicate an existing story. Propose 2–6 that genuinely add value. If none, return {"stories":[]}.`;

function parseJson(t: string) {
  const c = t.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(c.slice(c.indexOf("{"), c.lastIndexOf("}") + 1));
}
type ProposedStory = { title: string; acceptance?: string; points?: number; role?: string };

export async function POST(req: Request) {
  const { engagementId, epicId, mode, stories, actor } = (await req.json().catch(() => ({}))) as
    { engagementId?: string; epicId?: string; mode?: "propose" | "accept"; stories?: ProposedStory[]; actor?: string };
  const persist = mode === "accept";

  return streamExecution({ engagementId: engagementId ?? "", role: "product-owner", kind: "refine", actor, persist }, async (step) => {
    const sb = supabaseAdmin();
    if (!sb) throw new Error("Supabase not configured");
    if (!epicId) throw new Error("Pick an epic");
    const { data: epic } = await sb.from("epic").select("id, title, research_status, research_summary").eq("id", epicId).maybeSingle();
    if (!epic) throw new Error("epic not found");
    if (epic.research_status !== "approved") throw new Error("Research isn't approved for this epic yet");
    step(`▸ epic: ${epic.title} — research approved`);

    // ACCEPT — create the selected stories (additive)
    if (mode === "accept") {
      const clean = (stories ?? []).filter((s) => s?.title?.trim());
      if (!clean.length) throw new Error("No stories selected");
      const { data: eng } = await sb.from("engagement").select("atlassian_base_url, atlassian_email, atlassian_api_token, jira_project").eq("id", engagementId).maybeSingle();
      const jira = resolveJira(eng ?? {});
      step(`▸ creating ${clean.length} ${clean.length === 1 ? "story" : "stories"} under ${epicId}${jira ? " (Jira)" : " (local)"}…`);
      const { data: existing } = await sb.from("story").select("id").eq("epic_id", epicId);
      let n = (existing?.length ?? 0) + 1;
      const rows = [];
      for (const s of clean) {
        const storyRole = normalizeRole(s.role);
        let id = "";
        if (jira) { const iss = await createIssue(jira, { type: "Story", summary: s.title, description: s.acceptance || undefined, parentKey: epicId, labels: [storyRole] }); if (iss) id = iss.key; }
        if (!id) id = `${epicId}-s${n++}`;
        step(`  ✓ ${id} — ${s.title} · ${storyRole}`);
        // Refined from approved research → Ready. Move off the Backlog to To Do.
        if (jira && /^[A-Z][A-Z0-9]+-\d+$/.test(id)) { const ok = await transitionIssue(jira, id, STATUS.ready); step(`    ${ok ? "✓" : "•"} → ${STATUS.ready}${ok ? "" : " (skipped)"}`); }
        rows.push({ id, epic_id: epicId, title: s.title, assignee: "—", status: "idle", estimate_pts: s.points && s.points > 0 ? s.points : 0, ac_pass_pct: 0, acceptance: s.acceptance || null, role: storyRole });
      }
      if (rows.length) await sb.from("story").insert(rows);
      return { result: { ok: true, created: rows.length }, title: `Refined ${epic.title} — added ${rows.length} ${rows.length === 1 ? "story" : "stories"} from research`, related: epicId };
    }

    // PROPOSE — read findings + existing stories, propose (write nothing)
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY not set");
    const { data: existingStories } = await sb.from("story").select("title").eq("epic_id", epicId);
    step(`▸ reading approved research + ${(existingStories ?? []).length} existing stories…`);
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    step(`▸ refinement agent proposing (${model})…`);
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model, max_tokens: 2000, system: SYSTEM,
      messages: [{ role: "user", content: `Epic: ${epic.title}\n\nApproved research findings:\n${epic.research_summary ?? "(none)"}\n\nExisting stories:\n${(existingStories ?? []).map((s) => `- ${s.title}`).join("\n") || "(none)"}` }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    let plan: { stories: ProposedStory[] };
    try { plan = parseJson(text); } catch { throw new Error("Could not parse the proposals"); }
    const proposals = (plan.stories ?? []).slice(0, 8);
    step(`✓ ${proposals.length} proposed — review + accept`);
    return { result: { ok: true, proposals }, title: `Proposed ${proposals.length} refinements`, related: epicId };
  });
}
