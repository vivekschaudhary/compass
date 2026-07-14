import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/app/lib/supabase";
import { streamExecution } from "@/app/lib/exec";
import { resolveJira, addComment } from "@/app/lib/jira";
import { writeProviderDoc, stripHtml } from "@/app/lib/docstore";
import { startWork, resolveWork, handoffForApproval } from "@/app/lib/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The generic per-role workflow runner — ONE path that drives every declared role workflow through
// the AI-native ticket lifecycle. A spec says who owns it, what artifact it produces, and whether a
// human must gate it; the runner does startWork → produce artifact → handoff (gated) | resolve.
// New workflows go live by adding a spec entry here, not a new endpoint.
type Spec = {
  role: string;               // roleCode that owns the workflow
  verb: string;               // human label for the artifact ("Design spec", "Security scan"…)
  artifact: "confluence" | "comment";
  gate: boolean;              // true = a human must approve → Awaiting HITL approval
  gateRole?: string;          // who approves (default pm)
  focus: string;              // the role-specific instruction handed to the agent
};

export const WORKFLOW_SPECS: Record<string, Spec> = {
  "design-spec":    { role: "designer",     verb: "Design spec",      artifact: "confluence", gate: true,  gateRole: "pm",       focus: "Produce a design spec: user flows, key screens (described), states, and interaction notes. Functional, not visual pixel-detail." },
  "copy":           { role: "ux-writer",    verb: "UX copy",          artifact: "confluence", gate: true,  gateRole: "pm",       focus: "Produce the UX copy deck: screen-by-screen microcopy, empty/error/success states, and voice notes. Exact strings, ready to paste." },
  "tech-design":    { role: "architect",    verb: "Tech design",      artifact: "confluence", gate: true,  gateRole: "engineer", focus: "Produce a technical design: approach, key components/interfaces, data shape, risks, and a build sequence. No code." },
  "bet-architecture":{ role: "architect",   verb: "Epic architecture",artifact: "confluence", gate: true,  gateRole: "engineer", focus: "Produce the epic-level architecture: boundaries, sequencing of the stories, and cross-cutting concerns." },
  "launch-plan":    { role: "gtm",          verb: "Launch plan",      artifact: "confluence", gate: true,  gateRole: "pm",       focus: "Produce a go-to-market launch plan: audience, positioning, channels, timeline, and success metrics." },
  "release-comms":  { role: "gtm",          verb: "Release comms",    artifact: "confluence", gate: true,  gateRole: "pm",       focus: "Produce release communications: changelog-style highlights, an internal note, and a customer-facing announcement." },
  "execute-change": { role: "sre",          verb: "Change plan",      artifact: "comment",    gate: true,  gateRole: "delivery-manager", focus: "Produce a change-execution plan: steps, blast radius, rollback, and verification checks. Concise, checklist-style." },
  "e2e":            { role: "automation",   verb: "E2E test plan",    artifact: "comment",    gate: false,                       focus: "Produce an end-to-end test plan: the critical user journeys, cases, and expected assertions. Checklist-style." },
  "review-pr":      { role: "reviewer",     verb: "PR review",        artifact: "comment",    gate: false,                       focus: "Produce a code-review summary against the acceptance criteria: risks, gaps, and a clear approve/needs-work call." },
  "scan":           { role: "scanner",      verb: "Security scan",    artifact: "comment",    gate: false,                       focus: "Produce a security scan summary: likely risk areas for this work, severity, and recommended mitigations." },
  "docs":           { role: "tech-writer",  verb: "Docs update",      artifact: "confluence", gate: false,                       focus: "Produce the docs update this work implies: what pages change and the new/updated content." },
  "runbook":        { role: "sre",          verb: "Runbook",          artifact: "confluence", gate: false,                       focus: "Produce an operational runbook: alerts, dashboards, common failures, and step-by-step responses." },
  "status":         { role: "delivery-manager", verb: "Status roll-up", artifact: "comment", gate: false,                       focus: "Produce a crisp delivery status roll-up for this ticket: state, risks, and next step." },
};

const SYSTEM = (verb: string, focus: string) => `You are Compass's ${verb} agent working ONE ticket. ${focus}
Return ONLY valid JSON — no markdown, no prose — with this shape:
{"summary": string, "html": string}
- "summary": 2–4 sentences capturing the deliverable + the key decision/recommendation.
- "html": the full deliverable as HTML with <h2> sections, grounded in the ticket + acceptance. Mark inferences as assumptions. Do NOT invent statistics.`;

function parseJson(t: string) {
  const c = t.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(c.slice(c.indexOf("{"), c.lastIndexOf("}") + 1));
}

export async function POST(req: Request) {
  const { engagementId, workflowKey, storyId, actor } = (await req.json().catch(() => ({}))) as
    { engagementId?: string; workflowKey?: string; storyId?: string; actor?: string };
  const spec = workflowKey ? WORKFLOW_SPECS[workflowKey] : undefined;

  return streamExecution({ engagementId: engagementId ?? "", role: spec?.role ?? "engineer", kind: workflowKey ?? "workflow", actor }, async (step) => {
    const sb = supabaseAdmin();
    const key = process.env.ANTHROPIC_API_KEY;
    if (!sb) throw new Error("Supabase not configured");
    if (!key) throw new Error("ANTHROPIC_API_KEY not set");
    if (!spec) throw new Error(`Workflow "${workflowKey}" isn't runnable yet`);
    if (!storyId) throw new Error("Pick a ticket to run this on");

    const { data: story } = await sb.from("story").select("id, title, epic_id, acceptance").eq("id", storyId).maybeSingle();
    if (!story) throw new Error("story not found");
    const { data: eng } = await sb.from("engagement").select("*").eq("id", engagementId).maybeSingle();
    const { data: epic } = await sb.from("epic").select("id, title").eq("id", story.epic_id).maybeSingle();
    if (!eng) throw new Error("engagement not found");
    const jira = resolveJira(eng);
    const providerName = eng.docs_provider === "teams" ? "Teams/SharePoint" : "Confluence";
    step(`▸ ${spec.verb} · ${spec.role} · ticket ${story.id} — ${story.title}`);

    // pick it up → In Progress
    await startWork(jira, story.id, step);

    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    step(`▸ ${spec.role} agent producing the ${spec.verb.toLowerCase()} (${model})…`);
    const client = new Anthropic({ apiKey: key });
    const ctx = `Ticket: ${story.title}\nEpic: ${epic?.title ?? "—"}\nAcceptance:\n${story.acceptance || "(none stated — infer a sensible minimal scope)"}`;
    const msg = await client.messages.create({ model, max_tokens: 2500, system: SYSTEM(spec.verb, spec.focus), messages: [{ role: "user", content: ctx }] });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    let out: { summary: string; html: string };
    try { out = parseJson(text); } catch { throw new Error(`Could not parse the ${spec.verb.toLowerCase()}`); }
    step(`✓ draft ready — ${(out.summary || "").slice(0, 90)}…`);

    // land the artifact — a provider doc, or a comment on the ticket
    let related = story.id;
    if (spec.artifact === "confluence") {
      step(`▸ writing ${spec.verb} to ${providerName}…`);
      const doc = await writeProviderDoc(eng, `${spec.verb} — ${story.title}`, out.html || `<p>${out.summary}</p>`);
      step(doc ? `✓ page created — ${doc.url}` : `✓ provider not reachable — kept in-app`);
      if (doc?.url) related = doc.url;
    } else {
      step(`▸ posting ${spec.verb} as a comment on ${story.id}…`);
      const ok = jira ? await addComment(jira, story.id, `${spec.verb} (AI)\n\n${out.summary}\n\n${stripHtml(out.html).slice(0, 3000)}`) : false;
      step(ok ? `✓ comment posted on ${story.id}` : `✓ Jira not reachable — kept in-app`);
    }

    // self-heal the role label so this ticket routes to its owner going forward
    await sb.from("story").update({ role: spec.role }).eq("id", story.id);

    // gate or resolve
    if (spec.gate) {
      step(`▸ handing off for ${spec.gateRole ?? "pm"} approval…`);
      await handoffForApproval(sb, jira, {
        ticket: story.id, engagementId: engagementId!, gateRole: spec.gateRole ?? "pm",
        title: `Approve ${spec.verb.toLowerCase()} — ${story.title}`,
        subtitle: `The ${spec.role} produced the ${spec.verb.toLowerCase()}. Review it, then approve to move to Done.`,
        related, hook: `${workflowKey}:${story.id}`,
      }, step);
      return { result: { ok: true, story: story.id, gated: true, related }, title: `${spec.verb} — ${story.title}`, related: story.id, status: "filed" };
    }
    await resolveWork(jira, story.id, step);
    return { result: { ok: true, story: story.id, gated: false, related }, title: `${spec.verb} — ${story.title}`, related: story.id };
  });
}
