import { supabaseAdmin } from "@/app/lib/supabase";
import { streamExecution } from "@/app/lib/exec";
import { resolveJira, addComment, addRemoteLink } from "@/app/lib/jira";
import { writeProviderDoc, stripHtml } from "@/app/lib/docstore";
import { startWork, resolveWork, handoffForApproval } from "@/app/lib/lifecycle";
import { DOC_FORMAT, parseDoc } from "@/app/lib/aidoc";
import { generate, AI_MODEL } from "@/app/lib/dispatch";
import { WORKFLOW_SPECS } from "@/app/lib/workflow-specs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The generic per-role workflow runner — ONE path that drives every declared role workflow through
// the AI-native ticket lifecycle. A spec says who owns it, what artifact it produces, and whether a
// human must gate it; the runner does startWork → produce artifact → handoff (gated) | resolve.
// New workflows go live by adding a spec entry to lib/workflow-specs.ts, not a new endpoint.
// #148: the specs moved to lib/ so the client imports them directly instead of mirroring them.
const SYSTEM = (verb: string, focus: string) => `You are Compass's ${verb} agent working ONE ticket. ${focus}
The document is grounded in the ticket + acceptance, with <h2> sections. Mark inferences as assumptions. Do NOT invent statistics.
${DOC_FORMAT}`;

export async function POST(req: Request) {
  const { engagementId, workflowKey, storyId, actor } = (await req.json().catch(() => ({}))) as
    { engagementId?: string; workflowKey?: string; storyId?: string; actor?: string };
  const spec = workflowKey ? WORKFLOW_SPECS[workflowKey] : undefined;

  return streamExecution({ engagementId: engagementId ?? "", role: spec?.role ?? "engineer", kind: workflowKey ?? "workflow", actor, related: storyId, title: `${spec?.verb ?? "Workflow"} — ${storyId ?? ""}` }, async (step) => {
    const sb = supabaseAdmin();
    if (!sb) throw new Error("Supabase not configured");
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

    step(`▸ ${spec.role} agent producing the ${spec.verb.toLowerCase()} (${AI_MODEL})…`);
    const ctx = `Ticket: ${story.title}\nEpic: ${epic?.title ?? "—"}\nAcceptance:\n${story.acceptance || "(none stated — infer a sensible minimal scope)"}`;
    const text = await generate({ system: SYSTEM(spec.verb, spec.focus), user: ctx, maxTokens: 2500 });
    const out = parseDoc(text);
    step(`✓ draft ready — ${(out.summary || "").slice(0, 90)}…`);

    // land the artifact — a provider doc, or a comment on the ticket
    let related = story.id;
    if (spec.artifact === "confluence") {
      step(`▸ writing ${spec.verb} to ${providerName}…`);
      const doc = await writeProviderDoc(eng, `${spec.verb} — ${story.title}`, out.html || `<p>${out.summary}</p>`);
      step(doc ? `✓ page created — ${doc.url}` : `✓ provider not reachable — kept in-app`);
      if (doc?.url) related = doc.url;
      // link the doc back on the Jira ticket — a Web link (issue's "Web links") + a comment
      if (jira && doc?.url) {
        const linked = await addRemoteLink(jira, story.id, doc.url, `${spec.verb} — ${story.title}`);
        await addComment(jira, story.id, `${spec.verb} drafted (${providerName}): ${doc.url}`);
        step(linked ? `  ✓ web link + comment added to ${story.id}` : `  • couldn't add the web link to ${story.id}`);
      }
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
      return { result: { ok: true, story: story.id, gated: true, related, actions: out.actions }, title: `${spec.verb} — ${story.title}`, related: story.id, status: "filed" };
    }
    await resolveWork(jira, story.id, step);
    return { result: { ok: true, story: story.id, gated: false, related, actions: out.actions }, title: `${spec.verb} — ${story.title}`, related: story.id };
  });
}
