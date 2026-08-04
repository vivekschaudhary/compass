import { supabaseAdmin } from "@/app/lib/supabase";
import { readProviderDoc, writeProviderDoc } from "@/app/lib/docstore";
import { streamExecution } from "@/app/lib/exec";
import { resolveJira, addComment, addRemoteLink } from "@/app/lib/jira";
import { startWork, handoffForApproval } from "@/app/lib/lifecycle";
import { DOC_FORMAT, parseDoc } from "@/app/lib/aidoc";
import { generate, AI_MODEL } from "@/app/lib/dispatch";
import { WORKFLOW_SPECS } from "@/app/lib/workflow-specs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PM — the head of the lifecycle. Drafts the engagement's PRODUCT BRIEF from source material and
// lands it in the doc tree's `01-foundation/product-brief` slot.
//
// Why this isn't the generic /api/workflow runner (which the spec is still registered in, for its
// label + focus): that runner is TICKET-scoped — it demands a storyId and drafts from the ticket's
// acceptance criteria. The product brief is ENGAGEMENT-scoped and drafts from SOURCE MATERIAL (the
// SOW, a Confluence page, pasted notes). It also has to UPDATE the scaffolded foundation page, not
// create a sibling: the generic runner titles its output `<verb> — <ticket title>`, which would
// create a second page and leave `01-foundation/product-brief` empty — and /api/research reads the
// brief from exactly that path, so the whole downstream chain would silently see nothing.
//
// Source precedence: pasted text wins (an explicit override), else the SOW page already scaffolded
// at `02-scope/sow`. Refuses when neither exists rather than inventing a product from nothing.
const SYSTEM = `You are Compass's PM agent drafting the engagement's product brief. ${WORKFLOW_SPECS["product-brief"].focus}
The document is grounded ONLY in the source material provided. Mark inferences as assumptions. Do NOT invent statistics, users, or commitments the source doesn't support.
${DOC_FORMAT}`;

const BRIEF_PATH = "01-foundation/product-brief";
const SOW_PATH = "02-scope/sow";

export async function POST(req: Request) {
  const { engagementId, source, actor } = (await req.json().catch(() => ({}))) as
    { engagementId?: string; source?: string; actor?: string };

  return streamExecution(
    { engagementId: engagementId ?? "", role: "pm", kind: "product-brief", actor, title: "Product brief" },
    async (step) => {
      const sb = supabaseAdmin();
      if (!sb) throw new Error("Supabase not configured");
      if (!engagementId) throw new Error("Pick an engagement to run this on");

      const { data: eng } = await sb.from("engagement").select("*").eq("id", engagementId).maybeSingle();
      if (!eng) throw new Error("engagement not found");
      const jira = resolveJira(eng);
      const providerName = eng.docs_provider === "teams" ? "Teams/SharePoint" : "Confluence";
      step(`▸ Product brief · pm · ${eng.name}`);

      // ── source material ──────────────────────────────────────────────────
      const pasted = (source ?? "").trim();
      let sourceText = pasted;
      if (pasted) {
        step(`✓ using the source you provided — ${pasted.length} chars`);
      } else {
        step(`▸ reading the SOW from ${providerName} (${SOW_PATH})…`);
        const { data: sowPage } = await sb.from("doc_page")
          .select("provider, external_id").eq("engagement_id", engagementId).eq("path", SOW_PATH).maybeSingle();
        sourceText = (sowPage ? await readProviderDoc(eng, sowPage) : null) ?? "";
        step(sourceText
          ? `✓ SOW loaded — ${sourceText.length} chars`
          : `• no SOW page content at ${SOW_PATH}`);
      }
      if (!sourceText.trim()) {
        throw new Error(
          `No source material. Paste the SOW / vision / notes, or scaffold + fill ${SOW_PATH} in ${providerName} first. ` +
          `This workflow will not invent a product from nothing.`,
        );
      }

      // ── the Sprint 0 ticket that this workflow closes (optional) ─────────
      // Match the legacy command too. Engagements seeded before the rename carry
      // "via /setup-product" in their acceptance; matching only the new name would
      // silently skip their ticket — no In Progress, no gate, no approval job — and
      // look like it worked. Verified against live data: 2 such tickets exist today.
      const { data: s0 } = await sb.from("story")
        .select("id, title, status").eq("epic_id", `${engagementId}-S0`)
        .or("acceptance.ilike.%/create-product-brief%,acceptance.ilike.%/setup-product%")
        .maybeSingle();
      if (s0) {
        step(`▸ closing Sprint 0 ticket ${s0.id} — ${s0.title}`);
        await startWork(jira, s0.id, step);
      } else {
        step(`• no Sprint 0 foundation ticket found — drafting without ticket lifecycle`);
      }

      // ── draft ────────────────────────────────────────────────────────────
      step(`▸ pm agent drafting the product brief (${AI_MODEL})…`);
      const text = await generate({
        system: SYSTEM,
        user: `Engagement: ${eng.name}${eng.client ? ` (client: ${eng.client})` : ""}\n\nSource material:\n${sourceText}`,
        maxTokens: 3000,
      });
      const draft = parseDoc(text);
      step(`✓ draft ready — ${(draft.summary || "").slice(0, 90)}…`);

      // ── land it in the foundation slot (UPDATE, not a sibling) ───────────
      step(`▸ writing to ${providerName}…`);
      const doc = await writeProviderDoc(eng, "Product brief", draft.html || `<p>${draft.summary}</p>`);
      step(doc ? `✓ page written — ${doc.url}` : `✓ provider not reachable — draft kept in-app`);

      // Point the doc-tree row at the page, so /api/research (and anything else reading
      // `01-foundation/product-brief`) resolves it instead of finding an empty scaffold.
      if (doc?.id) {
        await sb.from("doc_page").update({
          external_id: doc.id, url: doc.url, status: "created",
          provider: eng.docs_provider === "teams" ? "teams" : "confluence",
        }).eq("engagement_id", engagementId).eq("path", BRIEF_PATH);
        step(`  ✓ ${BRIEF_PATH} now points at the page`);
      }

      if (jira && doc?.url && s0) {
        const linked = await addRemoteLink(jira, s0.id, doc.url, `Product brief — ${eng.name}`);
        await addComment(jira, s0.id, `Product brief drafted (${providerName}): ${doc.url}`);
        step(linked ? `  ✓ web link + comment added to ${s0.id}` : `  • couldn't add the web link to ${s0.id}`);
      }

      // ── gate ─────────────────────────────────────────────────────────────
      if (s0) {
        step(`▸ handing off for pm approval…`);
        await handoffForApproval(sb, jira, {
          ticket: s0.id, engagementId, gateRole: "pm",
          title: `Approve product brief — ${eng.name}`,
          subtitle: "The PM drafted the product brief from the source material. Review it, then approve to move it to Done.",
          related: doc?.url ?? s0.id, hook: `product-brief:${engagementId}`,
        }, step);
      }

      return {
        result: { ok: true, url: doc?.url ?? null, wrote: Boolean(doc), gated: Boolean(s0), actions: draft.actions },
        title: `Product brief — ${eng.name}`,
        related: s0?.id, status: s0 ? "filed" : undefined,
      };
    },
  );
}
