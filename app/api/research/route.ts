import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/app/lib/supabase";
import { readProviderDoc, writeProviderDoc } from "@/app/lib/docstore";
import { streamExecution } from "@/app/lib/exec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Researcher research workflow — reads the product brief from the engagement's docs provider and
// drafts a first-cut research doc back into the SAME provider, then files a PM-approval job.
// Streams each step (see streamExecution); the draft summary is cached on the epic for Refine.
const SYSTEM = `You are Compass's research agent. From a product brief + an epic, draft a first-cut research doc.
Return ONLY valid JSON — no markdown, no prose — with this shape:
{"summary": string, "html": string}
- "summary": 3–5 sentences of the key findings + the top recommendation (used later to refine the backlog).
- "html": a Confluence-storage / HTML research doc with <h2> sections: User insights · Competitive landscape · Key findings · Recommendations for the epic. Concrete and grounded in the brief. Mark inferences as assumptions. Do NOT invent statistics.`;

function parseJson(t: string) {
  const c = t.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(c.slice(c.indexOf("{"), c.lastIndexOf("}") + 1));
}

export async function POST(req: Request) {
  const { engagementId, epicId, actor } = (await req.json().catch(() => ({}))) as { engagementId?: string; epicId?: string; actor?: string };
  return streamExecution({ engagementId: engagementId ?? "", role: "researcher", kind: "research", actor }, async (step) => {
    const sb = supabaseAdmin();
    const key = process.env.ANTHROPIC_API_KEY;
    if (!sb) throw new Error("Supabase not configured");
    if (!key) throw new Error("ANTHROPIC_API_KEY not set");
    if (!epicId) throw new Error("Pick an epic to research");

    const { data: eng } = await sb.from("engagement").select("*").eq("id", engagementId).maybeSingle();
    const { data: epic } = await sb.from("epic").select("id, title, note").eq("id", epicId).maybeSingle();
    if (!eng || !epic) throw new Error("engagement/epic not found");
    const providerName = eng.docs_provider === "teams" ? "Teams/SharePoint" : "Confluence";
    step(`▸ epic: ${epic.title}`);

    step(`▸ reading product brief from ${providerName}…`);
    const { data: brief } = await sb.from("doc_page").select("provider, external_id").eq("engagement_id", engagementId).eq("path", "01-foundation/product-brief").maybeSingle();
    const briefText = (brief ? await readProviderDoc(eng, brief) : null)
      || [`Engagement: ${eng.name} (${eng.sow ?? ""})`, epic.note ? `Epic brief: ${epic.note}` : ""].filter(Boolean).join("\n");
    step(brief && briefText ? `✓ brief loaded — ${briefText.length} chars` : `✓ no brief page — using epic context (${briefText.length} chars)`);

    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    step(`▸ research agent drafting (${model})…`);
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({ model, max_tokens: 2500, system: SYSTEM, messages: [{ role: "user", content: `Epic: ${epic.title}\n\nProduct brief / context:\n${briefText}` }] });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    let draft: { summary: string; html: string };
    try { draft = parseJson(text); } catch { throw new Error("Could not parse the research draft"); }
    step(`✓ draft ready — ${(draft.summary || "").slice(0, 90)}…`);

    step(`▸ writing draft to ${providerName}…`);
    const doc = await writeProviderDoc(eng, `Research — ${epic.title}`, draft.html || `<p>${draft.summary}</p>`);
    step(doc ? `✓ page created — ${doc.url}` : `✓ provider not reachable — draft kept in-app`);

    step(`▸ recording draft + filing PM approval…`);
    await sb.from("epic").update({ research_status: "draft", research_url: doc?.url ?? null, research_summary: draft.summary }).eq("id", epicId);
    await sb.from("job").upsert({
      id: `research-approve-${epicId}`, engagement_id: engagementId, role: "pm", kind: "approve",
      title: `Approve research — ${epic.title}`,
      subtitle: "The Researcher drafted the findings. Review the doc, then approve to unlock refinement.",
      meta: "research draft", related: doc?.url ?? epicId, primary_label: "Approve research", secondary_label: null, tone: "default", ord: 0,
    });
    step(`✓ PM approval filed`);

    return { result: { ok: true, url: doc?.url ?? null, wrote: Boolean(doc) }, title: `Drafted research — ${epic.title}`, related: epicId };
  });
}
