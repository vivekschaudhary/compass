import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/app/lib/supabase";
import { resolveJira, createIssue, transitionIssue } from "@/app/lib/jira";
import { streamExecution } from "@/app/lib/exec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Triage: classify an incoming issue (type/severity/area/routing) and file it as a routed Jira
// issue. AI classification is best-effort — a raw report still files a sensible Bug if the model
// or key is unavailable.
const SYSTEM = `You are Compass's triage agent. Classify an incoming issue report.
Return ONLY valid JSON — no markdown — shape:
{"issueType":"Bug"|"Task","severity":"P1"|"P2"|"P3"|"P4","area":"Engineering"|"QA"|"Design"|"Product","recommendation":"fix-now"|"backlog"|"decline","note":string}
Rules: P1 = outage/data-loss/security; P2 = major broken flow; P3 = minor/limited; P4 = cosmetic/nit.
"note" is one sentence on the routing rationale. Be conservative — don't inflate severity.`;

type Triage = { issueType: string; severity: string; area: string; recommendation: string; note: string };

async function classify(title: string, description: string): Promise<Triage> {
  const key = process.env.ANTHROPIC_API_KEY;
  const fallback: Triage = { issueType: "Bug", severity: "P3", area: "Engineering", recommendation: "backlog", note: "Filed without AI triage." };
  if (!key) return fallback;
  try {
    const client = new Anthropic({ apiKey: key });
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    const msg = await client.messages.create({ model, max_tokens: 500, system: SYSTEM, messages: [{ role: "user", content: `Title: ${title}\n\n${description}` }] });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const c = text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    return { ...fallback, ...JSON.parse(c.slice(c.indexOf("{"), c.lastIndexOf("}") + 1)) };
  } catch { return fallback; }
}

export async function POST(req: Request) {
  const { engagementId, title, description, actor } = (await req.json().catch(() => ({}))) as { engagementId?: string; title?: string; description?: string; actor?: string };

  return streamExecution({ engagementId: engagementId ?? "", role: "support", kind: "triage", actor }, async (step) => {
    const sb = supabaseAdmin();
    if (!sb) throw new Error("Supabase not configured");
    if (!title?.trim()) throw new Error("An issue title is required");

    const { data: eng } = await sb.from("engagement")
      .select("atlassian_base_url, atlassian_email, atlassian_api_token, jira_project").eq("id", engagementId).maybeSingle();
    const jira = resolveJira(eng ?? {});
    if (!jira) throw new Error("Jira isn't configured for this engagement");

    step(`▸ triage agent classifying…`);
    const t = await classify(title, description ?? "");
    step(`✓ ${t.issueType} · ${t.severity} · ${t.area} · ${t.recommendation}`);
    const type = t.issueType === "Task" ? "Task" : "Bug";
    const body = `${description ?? ""}\n\n— Triage —\nSeverity: ${t.severity} · Area: ${t.area} · Recommendation: ${t.recommendation}\n${t.note}`;
    step(`▸ filing Jira ${type}…`);
    const issue = await createIssue(jira, { type, summary: title, description: body });
    if (!issue) throw new Error("Could not create the Jira issue");
    step(`  ✓ ${issue.key}`);
    if (t.recommendation === "fix-now") { await transitionIssue(jira, issue.key, "To Do"); step(`▸ routed fix-now → To Do`); }

    return { result: { ok: true, key: issue.key, type, ...t }, title: `Triaged — ${title} (${t.severity} · ${t.recommendation})`, related: issue.key, status: "filed" };
  });
}
