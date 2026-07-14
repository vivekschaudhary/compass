import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/app/lib/supabase";
import { readProviderDoc, writeProviderDoc } from "@/app/lib/docstore";
import { streamExecution } from "@/app/lib/exec";
import { resolveJira } from "@/app/lib/jira";
import { startWork, handoffForApproval } from "@/app/lib/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Researcher research workflow — the reference instance of the AI-native ticket lifecycle. Operates
// on a research-labeled STORY (not the epic): moves it In Progress → drafts a research doc into the
// engagement's docs provider → Awaiting HITL approval (a PM sign-off job). The draft summary is
// cached on the parent epic for the PO's Refine gate.
const SYSTEM = `You are Compass's research agent. From a product brief + a story, draft a first-cut research doc.
Return ONLY valid JSON — no markdown, no prose — with this shape:
{"summary": string, "html": string}
- "summary": 3–5 sentences of the key findings + the top recommendation (used later to refine the backlog).
- "html": a Confluence-storage / HTML research doc with <h2> sections: User insights · Competitive landscape · Key findings · Recommendations. Concrete and grounded in the brief. Mark inferences as assumptions. Do NOT invent statistics.`;

function parseJson(t: string) {
  const c = t.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(c.slice(c.indexOf("{"), c.lastIndexOf("}") + 1));
}

export async function POST(req: Request) {
  const { engagementId, storyId, actor } = (await req.json().catch(() => ({}))) as { engagementId?: string; storyId?: string; actor?: string };
  return streamExecution({ engagementId: engagementId ?? "", role: "researcher", kind: "research", actor }, async (step) => {
    const sb = supabaseAdmin();
    const key = process.env.ANTHROPIC_API_KEY;
    if (!sb) throw new Error("Supabase not configured");
    if (!key) throw new Error("ANTHROPIC_API_KEY not set");
    if (!storyId) throw new Error("Pick a research ticket to run");

    const { data: story } = await sb.from("story").select("id, title, epic_id").eq("id", storyId).maybeSingle();
    if (!story) throw new Error("story not found");
    const { data: eng } = await sb.from("engagement").select("*").eq("id", engagementId).maybeSingle();
    const { data: epic } = await sb.from("epic").select("id, title, note").eq("id", story.epic_id).maybeSingle();
    if (!eng || !epic) throw new Error("engagement/epic not found");
    const jira = resolveJira(eng);
    const providerName = eng.docs_provider === "teams" ? "Teams/SharePoint" : "Confluence";
    step(`▸ ticket: ${story.id} — ${story.title}  (epic ${epic.id})`);

    // pick it up → In Progress
    await startWork(jira, story.id, step);

    step(`▸ reading product brief from ${providerName}…`);
    const { data: brief } = await sb.from("doc_page").select("provider, external_id").eq("engagement_id", engagementId).eq("path", "01-foundation/product-brief").maybeSingle();
    const briefText = (brief ? await readProviderDoc(eng, brief) : null)
      || [`Engagement: ${eng.name} (${eng.sow ?? ""})`, epic.note ? `Epic brief: ${epic.note}` : "", `Story: ${story.title}`].filter(Boolean).join("\n");
    step(brief && briefText ? `✓ brief loaded — ${briefText.length} chars` : `✓ no brief page — using story/epic context (${briefText.length} chars)`);

    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    step(`▸ research agent drafting (${model})…`);
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({ model, max_tokens: 2500, system: SYSTEM, messages: [{ role: "user", content: `Story: ${story.title}\nEpic: ${epic.title}\n\nProduct brief / context:\n${briefText}` }] });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    let draft: { summary: string; html: string };
    try { draft = parseJson(text); } catch { throw new Error("Could not parse the research draft"); }
    step(`✓ draft ready — ${(draft.summary || "").slice(0, 90)}…`);

    step(`▸ writing draft to ${providerName}…`);
    const doc = await writeProviderDoc(eng, `Research — ${epic.title}`, draft.html || `<p>${draft.summary}</p>`);
    step(doc ? `✓ page created — ${doc.url}` : `✓ provider not reachable — draft kept in-app`);

    // record the draft (self-heal the label) + cache the summary on the epic for the Refine gate
    step(`▸ recording draft…`);
    await sb.from("story").update({ role: "researcher" }).eq("id", story.id);
    await sb.from("epic").update({ research_status: "draft", research_url: doc?.url ?? null, research_summary: draft.summary }).eq("id", epic.id);

    // hand off → Awaiting HITL approval + a PM approval job
    step(`▸ handing off for PM approval…`);
    await handoffForApproval(sb, jira, {
      ticket: story.id, engagementId: engagementId!, gateRole: "pm",
      title: `Approve research — ${epic.title}`,
      subtitle: "The Researcher drafted the findings. Review the doc, then approve to unlock refinement.",
      related: doc?.url ?? story.id, hook: `research:${epic.id}`,
    }, step);

    return { result: { ok: true, story: story.id, url: doc?.url ?? null, wrote: Boolean(doc) }, title: `Drafted research — ${epic.title}`, related: story.id, status: "filed" };
  });
}
