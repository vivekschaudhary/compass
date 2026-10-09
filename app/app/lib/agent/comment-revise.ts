// Applying the answers a person accepted: the next version of the document.
//
// The second half of `comment-respond.ts`. There the model said, briefly, what it would do about each
// comment; a person accepted or declined each one. Here the accepted ones are applied TOGETHER, in a
// single revision, so two accepted answers that touch one paragraph are reconciled rather than
// applied one over the other.
//
// WHAT THE MODEL MAY CHANGE IS NARROWER THAN WHAT IT READS. It sees the whole document and every
// accepted answer, but it returns only the sections it changed, by heading. Every other section is
// carried over by CODE, byte for byte — the same guarantee `editSection` makes, and for the same
// reason: a model asked to reproduce a whole document will, now and then, quietly reword a paragraph
// nobody commented on. It cannot add, remove, rename or reorder a section, so the template floor
// cannot be broken here by construction.
//
// A COMMENT IS RESOLVED ONLY IF THE MODEL SAYS IT ADDRESSED IT. The model lists which accepted
// comments its revision settles; one it leaves out keeps its comment open rather than being closed on
// the strength of an edit that does not do what was accepted. A comment whose accepted answer was
// `no_change` needs no edit and resolves straight away — accepting "this stands, because…" IS the
// outcome.
//
// FAIL LOUD, ALL OR NOTHING. A refusal, a missing tool call, a malformed answer, a section that does
// not exist or did not change, an accepted comment unaccounted for, or a document that moved while the
// model ran: nothing is filed and nothing is resolved.
//
// NOT A RUN. Like the respond step, this never touches the task — it is how a closed row's document
// is corrected without reopening it.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "../data/actor";
import { emit } from "../data/events";
import { publishToDocs } from "../data/publish";
import { buildContext, inputPrompt } from "./context";
import { selectHost, MODEL } from "./hosts/select";
import { loadThreads, type Thread } from "./comment-respond";

export type ReviseResult =
  | { ok: true; version: string | null; resolved: number; note?: string }
  | { ok: false; error: string };

type Accepted = { thread: Thread; answer: Thread["replies"][number] };

const REVISE_TOOL = {
  name: "revised_sections",
  description:
    "Return ONLY the sections you changed, in full, and which accepted comments the changes settle. " +
    "Sections you do not return are kept exactly as they are.",
  input_schema: {
    type: "object" as const,
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string", description: "The section's heading, exactly as it is now." },
            body: { type: "string", description: "The section's complete new body, in markdown." },
          },
          required: ["heading", "body"],
          additionalProperties: false,
        },
      },
      addressed: {
        type: "array",
        items: { type: "string" },
        description: "Ids of the accepted comments these changes settle.",
      },
    },
    required: ["sections", "addressed"],
    additionalProperties: false,
  },
  strict: true,
};

/**
 * Check the model's revision against the document and the comments it was asked about.
 *
 * Pure, so every refusal is testable without a model. Names every problem at once.
 */
export function validateRevision(
  raw: { sections?: unknown; addressed?: unknown },
  current: { heading: string; body: string }[],
  mustAddress: string[],
): { ok: true; changed: Map<string, string>; addressed: string[] } | { ok: false; error: string } {
  const problems: string[] = [];
  const byHeading = new Map(current.map((s) => [s.heading, s.body]));
  const changed = new Map<string, string>();

  const sections = Array.isArray(raw.sections) ? raw.sections : null;
  if (!sections) problems.push("returned no sections list");
  for (const entry of sections ?? []) {
    const e = (entry ?? {}) as { heading?: unknown; body?: unknown };
    const heading = String(e.heading ?? "");
    const body = String(e.body ?? "");
    if (!byHeading.has(heading)) { problems.push(`changed a section that does not exist (\`${heading || "empty heading"}\`)`); continue; }
    if (changed.has(heading)) { problems.push(`returned \`${heading}\` twice`); continue; }
    if (!body.trim()) { problems.push(`emptied \`${heading}\``); continue; }
    if (body === byHeading.get(heading)) { problems.push(`returned \`${heading}\` unchanged`); continue; }
    changed.set(heading, body);
  }

  const addressed = Array.isArray(raw.addressed) ? [...new Set(raw.addressed.map(String))] : null;
  if (!addressed) problems.push("did not say which comments it addressed");
  const asked = new Set(mustAddress);
  const stray = (addressed ?? []).filter((id) => !asked.has(id));
  if (stray.length) problems.push(`claimed to address comments that were not accepted (${stray.join(", ")})`);

  if (mustAddress.length && !changed.size && !problems.length) problems.push("changed nothing");
  // A revision that edits text but settles no comment cannot be told apart from an unrelated rewrite.
  if (changed.size && addressed && !addressed.length) problems.push("changed sections but named no comment they settle");

  if (problems.length) return { ok: false, error: `The model's revision was refused — it ${problems.join("; ")}.` };
  return { ok: true, changed, addressed: addressed ?? [] };
}

/** The user message: the document, then each accepted answer to apply. */
export function revisionPrompt(documentText: string, accepted: Accepted[]): string {
  const parts: string[] = [];
  parts.push(
    "Below is a document and the changes a person has ACCEPTED in response to reviewers' comments. " +
    "Apply them through `revised_sections`.\n\n" +
    "Return only the sections you change, each in full. Do not touch anything the accepted answers do " +
    "not call for, and do not rename a section. Where two accepted answers affect the same text, make " +
    "one coherent change that serves both. Then list in `addressed` the id of every accepted comment " +
    "your changes settle — leave out any you did not actually do.",
  );
  parts.push(`<document>\n${documentText}\n</document>`);
  parts.push("# Accepted changes");
  for (const { thread: t, answer } of accepted) {
    parts.push(
      `\n## comment \`${t.id}\` — section: ${t.heading}\n- about: “${t.quote}”\n- ${t.author} said: ${t.body}\n` +
      `- accepted answer: ${answer.body}`,
    );
  }
  parts.push(
    "\nA quote may no longer appear verbatim; the document may have been revised since the comment " +
    "was made. Apply each change to the current text.",
  );
  return parts.join("\n");
}

export async function applyAcceptedAnswers(actor: Actor, taskId: string): Promise<ReviseResult> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const ctx = await buildContext(actor, taskId);
  if (!ctx) return { ok: false, error: "That task is not in your engagement." };
  if (ctx.renders === "doc-review" || ctx.renders === "code-review") {
    return { ok: false, error: "This task reviews the document — it does not author it. Apply answers from the row that drafted it." };
  }
  if (!ctx.produces) return { ok: false, error: "This task has no document to revise." };
  if (!ctx.agentFile) return { ok: false, error: `No agent file for role \`${ctx.roleCode}\` — there is no standard to revise against.` };
  // A backlog's sections are generated from its structured rows; rewording the page would leave the
  // rows saying something else.
  if (ctx.destination === "tickets") {
    return { ok: false, error: "This document is generated from structured rows. Revise it by redrafting, not by applying comments." };
  }

  const { data: doc } = await sb.from("document")
    .select("id, title, current_version_id, owner_role_code")
    .eq("engagement_id", actor.engagementId).eq("path", ctx.produces).maybeSingle();
  if (!doc?.current_version_id) return { ok: false, error: `No document at ${ctx.produces} yet.` };
  const startedOn = doc.current_version_id as string;

  const threads = await loadThreads(sb, doc.id as string);
  const accepted: Accepted[] = [];
  for (const t of threads) {
    if (t.status !== "open") continue;
    // The latest accepted answer. Several may exist: a declined one, then an accepted retry.
    const answer = [...t.replies].reverse().find((r) => r.stance && r.decision === "accepted");
    if (answer) accepted.push({ thread: t, answer });
  }
  if (!accepted.length) return { ok: false, error: "No accepted answers are waiting to be applied." };

  const needsEdit = accepted.filter((a) => a.answer.stance === "change");

  const { data: sections } = await sb.from("document_section")
    .select("heading, body, ord, edited").eq("document_version_id", startedOn).order("ord");
  if (!sections?.length) return { ok: false, error: "The current version has no sections." };
  const current = sections.map((s) => ({ heading: s.heading as string, body: s.body as string }));

  let version: string | null = null;
  let publishError: string | null = null;
  let note: string | undefined;

  if (needsEdit.length) {
    let result;
    try {
      result = await selectHost().dispatch({
        model: MODEL,
        maxTokens: 32000,
        system: ctx.agentFile,
        tools: [REVISE_TOOL],
        messages: [{
          role: "user",
          content: `${inputPrompt(ctx)}\n\n---\n\n${revisionPrompt(
            current.map((s) => `## ${s.heading}\n${s.body}`).join("\n\n"), needsEdit)}`,
        }],
      });
    } catch (e) {
      return { ok: false, error: `Could not reach a model host: ${e instanceof Error ? e.message : String(e)}` };
    }

    if (result.stopReason === "refusal") {
      return { ok: false, error: `The model declined to revise. ${result.refusalExplanation ?? "No explanation given."}` };
    }
    const call = result.toolCall;
    if (!call || call.name !== REVISE_TOOL.name) {
      return {
        ok: false,
        error: `The model answered without using \`${REVISE_TOOL.name}\`${result.text ? `: ${result.text.slice(0, 300)}` : "."}`,
      };
    }

    const checked = validateRevision(
      (call.input ?? {}) as { sections?: unknown; addressed?: unknown }, current, needsEdit.map((a) => a.thread.id));
    if (!checked.ok) return checked;

    // Everything it said it did must be everything it was asked to do. A comment left out stays open.
    const addressed = new Set(checked.addressed);
    const skipped = needsEdit.filter((a) => !addressed.has(a.thread.id));
    // Resolve only what was addressed; the rest remain accepted-and-open for another pass.
    needsEdit.splice(0, needsEdit.length, ...needsEdit.filter((a) => addressed.has(a.thread.id)));

    const { data: now } = await sb.from("document").select("current_version_id").eq("id", doc.id).maybeSingle();
    if (now?.current_version_id !== startedOn) {
      return { ok: false, error: "The document was revised while the answers were being applied. Apply them again against the new version." };
    }

    const { data: prior } = await sb.from("document_version")
      .select("published_to_docs_at").eq("id", startedOn).maybeSingle();

    const { data: eng } = await sb.from("engagement").select("org_id").eq("id", actor.engagementId).maybeSingle();
    const { data: versionId, error } = await sb.rpc("file_document", {
      p_org_id: eng?.org_id ?? actor.orgId,
      p_engagement_id: actor.engagementId,
      p_path: ctx.produces,
      p_title: doc.title,
      p_sections: current.map((s) => ({ heading: s.heading, body: checked.changed.get(s.heading) ?? s.body })),
      p_version: null,
      p_actor: actor.holder ?? actor.roleCode,
      p_actor_role: actor.roleCode,
      p_owner_role: doc.owner_role_code,
      p_task_id: taskId,
    });
    if (error || !versionId) return { ok: false, error: `Filing the revision failed: ${error?.message ?? "no version returned"}.` };

    // `edited` is carried forward, for the reason `editSection` states: sections are recreated per
    // version, and a person's earlier rewrite must not quietly lose its mark.
    const editedHeadings = sections.filter((s) => s.edited).map((s) => s.heading as string);
    if (editedHeadings.length) {
      const { error: flagErr } = await sb.from("document_section")
        .update({ edited: true }).eq("document_version_id", versionId as string).in("heading", editedHeadings);
      if (flagErr) return { ok: false, error: `The revision was filed, but carrying the edited marks failed: ${flagErr.message}.` };
    }

    const { data: filed } = await sb.from("document_version").select("version").eq("id", versionId as string).maybeSingle();
    version = (filed?.version as string | undefined) ?? null;

    await emit({
      engagementId: actor.engagementId,
      subjectType: "document",
      subjectId: versionId as string,
      verb: "document.filed",
      actorKind: "agent",
      actorRoleCode: ctx.roleCode,
      payload: { taskId, path: ctx.produces, source: "comments", sections: [...checked.changed.keys()], comments: [...addressed] },
    });

    // The doc store should follow, if it was following before — see `editSection`.
    if (prior?.published_to_docs_at) {
      const published = await publishToDocs(actor.engagementId, versionId as string);
      if (!published.ok) publishError = published.error;
    }

    if (skipped.length) {
      // Reported through the return value, not swallowed: these stay open and accepted.
      note = `${skipped.length} accepted comment(s) were not addressed by the revision and stay open.`;
    }
  }

  // Resolve what was settled: the addressed edits, and every accepted "no change".
  const toResolve = [...needsEdit, ...accepted.filter((a) => a.answer.stance === "no_change")];
  for (const { thread, answer } of toResolve) {
    const { error } = await sb.from("document_comment")
      .update({ status: "resolved", resolved_by: answer.decidedBy ?? actor.holder ?? actor.roleCode, resolved_at: new Date().toISOString() })
      .eq("id", thread.id).eq("status", "open");
    if (error) return { ok: false, error: `Filed${version ? ` v${version}` : ""}, but resolving a comment failed: ${error.message}.` };
  }

  // Loud, like `editSection`: the version is filed and the comments resolved, but the doc store
  // still shows the old text, and that must not read as success.
  if (publishError) {
    return {
      ok: false,
      error: `Filed v${version ?? "?"} and resolved ${toResolve.length} comment(s), but publishing it to the doc store failed: ${publishError}. The doc store still shows the old text.`,
    };
  }
  return { ok: true, version, resolved: toResolve.length, ...(note ? { note } : {}) };
}
