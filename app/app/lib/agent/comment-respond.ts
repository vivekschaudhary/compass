// The drafter's side answering review comments, WITHOUT reopening the task.
//
// A comment left on a document used to be a dead end for the author: the only way to act on it was
// to send the agent back through the chat, and that is a full run — it needs `running`, loads the
// whole role and refiles the entire document. A one-line comment should not cost a redraft, and
// cherry-picking a section out of context gives the model too little to answer well.
//
// So this is its own entry point. It reads what the agent normally reads (its pinned inputs and its
// role's markdown), the document as it stands now, and EVERY open comment together — comments overlap,
// and answering them one at a time is how two of them get contradictory fixes. It writes one short
// reply per comment and nothing else: no new version, no task state change, no claim on the task.
// What happens to an answer — accept, decline — is a person's decision, made elsewhere.
//
// FAIL LOUD, ALL OR NOTHING. A model that answers four of five comments and drops one has not
// answered the document's comments, and a partial write is indistinguishable from a complete one to
// whoever reads the column. Any comment left unanswered, any reference the model invented, any
// malformed answer: the whole run is refused and nothing is written.
//
// A COMMENT WITH A LIVE ANSWER IS SKIPPED. An answer nobody has decided yet is still waiting on a
// person, and an accepted one is waiting to be applied; asking again would stack a second answer
// under either. A comment whose answer was DECLINED is answered again — and the reason it was declined is part of what the model is shown,
// or it would just propose the same thing.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "../data/actor";
import { emit } from "../data/events";
import { buildContext, inputPrompt, loadDocumentText } from "./context";
import { selectHost, MODEL } from "./hosts/select";

/** A comment the model is asked about, with the conversation under it. */
export type OpenComment = {
  id: string;
  sectionId: string;
  /** The heading of the section it was made on — on the version it was made on. */
  heading: string;
  quote: string;
  body: string;
  author: string;
  thread: { author: string; kind: "human" | "agent" | "system"; body: string; decision: "accepted" | "declined" | null }[];
};

/** What the model returns for one comment, once validated. */
export type Answer = {
  commentId: string;
  stance: "change" | "no_change";
  answer: string;
  overlapsWith: string[];
};

export type RespondResult =
  | { ok: true; answered: number }
  | { ok: false; error: string };

/** Longest an answer may run. The brief is "short and precise"; a model that ignores it is refused. */
export const MAX_ANSWER_CHARS = 400;

const ANSWER_TOOL = {
  name: "comment_answers",
  description:
    "Answer EVERY comment you were given, once each, and nothing else. `ref` is the comment's id, " +
    "echoed exactly.",
  input_schema: {
    type: "object" as const,
    properties: {
      answers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ref: { type: "string", description: "Exactly the id you were given for this comment." },
            stance: {
              type: "string",
              enum: ["change", "no_change"],
              description:
                "`change` if the document text should change in response; `no_change` if it should " +
                "stay as it is.",
            },
            answer: {
              type: "string",
              description:
                `One or two plain sentences, at most ${MAX_ANSWER_CHARS} characters. For \`change\`: what ` +
                "you would change and why it settles the comment. For `no_change`: the reason the text " +
                "stands. No preamble, no restating the comment.",
            },
            overlaps_with: {
              type: "array",
              items: { type: "string" },
              description:
                "Ids of OTHER comments in this batch that the same change would settle. Empty when none.",
            },
          },
          required: ["ref", "stance", "answer", "overlaps_with"],
          additionalProperties: false,
        },
      },
    },
    required: ["answers"],
    additionalProperties: false,
  },
  strict: true,
};

/**
 * Check what the model returned against what it was asked.
 *
 * Pure, so every refusal path is testable without a model. Returns the answers, or ONE reason that
 * names everything wrong — a run that reports only the first problem makes the operator fix and
 * re-run once per problem.
 *
 * LENGTH IS A BRIEF, NOT AN INTEGRITY RULE, so it is reported apart. An answer that runs over the limit
 * still ANSWERED its comment — saying it was also "left unanswered" is false and buries the real
 * problem. When length is the ONLY thing wrong, `retry` names the offenders so the caller can ask
 * once more with that said; any other problem (an invented ref, a bad stance, a missing comment) is
 * not something saying it again would fix, and carries no `retry`.
 */
export function validateAnswers(
  raw: unknown, asked: string[],
): { ok: true; answers: Answer[] } | { ok: false; error: string; retry?: { id: string; length: number }[] } {
  if (!Array.isArray(raw)) return { ok: false, error: "The model returned no answers." };

  const known = new Set(asked);
  const problems: string[] = [];
  const tooLong: { id: string; length: number }[] = [];
  const answers = new Map<string, Answer>();
  const seen = new Set<string>();

  for (const entry of raw) {
    const e = (entry ?? {}) as { ref?: unknown; stance?: unknown; answer?: unknown; overlaps_with?: unknown };
    const ref = String(e.ref ?? "");
    if (!known.has(ref)) { problems.push(`answered a comment that was not asked about (\`${ref || "empty ref"}\`)`); continue; }
    if (seen.has(ref)) { problems.push(`answered \`${ref}\` twice`); continue; }
    seen.add(ref);

    const stance = e.stance;
    if (stance !== "change" && stance !== "no_change") { problems.push(`gave \`${ref}\` no valid stance`); continue; }

    const text = String(e.answer ?? "").trim();
    if (!text) { problems.push(`gave \`${ref}\` an empty answer`); continue; }
    if (text.length > MAX_ANSWER_CHARS) { tooLong.push({ id: ref, length: text.length }); continue; }

    const overlaps = Array.isArray(e.overlaps_with) ? e.overlaps_with.map(String) : [];
    const bad = overlaps.filter((o) => !known.has(o) || o === ref);
    if (bad.length) { problems.push(`pointed \`${ref}\` at unknown or self overlaps (${bad.join(", ")})`); continue; }

    answers.set(ref, { commentId: ref, stance, answer: text, overlapsWith: [...new Set(overlaps)] });
  }

  for (const id of asked) if (!seen.has(id)) problems.push(`left \`${id}\` unanswered`);

  const lengthProblems = tooLong.map((t) => `answered \`${t.id}\` in ${t.length} characters (limit ${MAX_ANSWER_CHARS})`);
  if (problems.length || lengthProblems.length) {
    return {
      ok: false,
      error: `The model's answers were refused — it ${[...problems, ...lengthProblems].join("; ")}.`,
      ...(!problems.length ? { retry: tooLong } : {}),
    };
  }
  return { ok: true, answers: asked.map((id) => answers.get(id)!) };
}

/** The user message: the comments, with their threads, against the document as it stands. */
export function commentsPrompt(documentText: string, comments: OpenComment[]): string {
  const parts: string[] = [];
  parts.push(
    "A reviewer has left comments on the document below. Answer every one of them through " +
    "`comment_answers`, once each.\n\n" +
    "You are NOT rewriting the document now. For each comment say, briefly, whether the text should " +
    "change and what the change would be, or why it should stand. A person decides; a later step " +
    "applies what they accept.\n\n" +
    "Read the comments together. Where one change would settle several, say so in `overlaps_with` on " +
    "each of them rather than proposing the same edit several ways.",
  );
  parts.push(`<document>\n${documentText || "_The document has no sections yet._"}\n</document>`);

  parts.push("# The comments");
  for (const c of comments) {
    const thread = c.thread.length
      ? "\n  earlier in this thread:\n" + c.thread.map((t) =>
          `  - ${t.author}${t.kind === "agent" ? " (you)" : ""}: ${t.body}` +
          (t.decision === "declined" ? "  ← this answer was DECLINED; do not propose it again" : ""),
        ).join("\n")
      : "";
    parts.push(
      `\n## id \`${c.id}\`\n- on the section: ${c.heading}\n- about: “${c.quote}”\n` +
      `- ${c.author} said: ${c.body}${thread}`,
    );
  }
  parts.push(
    "\nA quote may no longer appear verbatim — the document may have been revised since the comment " +
    "was made. Answer against the current text.",
  );
  return parts.join("\n");
}

/**
 * Answer every open comment on a drafting task's document.
 *
 * Refuses a REVIEW row (it does not author the document, so it has no business proposing its
 * edits) and a row with no document. Never touches `work_task`.
 */
export async function respondToComments(actor: Actor, taskId: string): Promise<RespondResult> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const ctx = await buildContext(actor, taskId);
  if (!ctx) return { ok: false, error: "That task is not in your engagement." };
  if (ctx.renders === "doc-review" || ctx.renders === "code-review") {
    return { ok: false, error: "This task reviews the document — it does not author it. Answer comments from the row that drafted it." };
  }
  if (!ctx.produces) return { ok: false, error: "This task has no document to answer comments on." };
  if (!ctx.agentFile) return { ok: false, error: `No agent file for role \`${ctx.roleCode}\` — there is no standard to answer against.` };

  const { data: doc } = await sb.from("document")
    .select("id, current_version_id").eq("engagement_id", actor.engagementId).eq("path", ctx.produces).maybeSingle();
  if (!doc?.current_version_id) return { ok: false, error: `No document at ${ctx.produces} yet.` };
  const startedOn = doc.current_version_id as string;

  const open = await openCommentsFor(sb, doc.id as string);
  if (!open.length) return { ok: false, error: "There are no open comments waiting for an answer." };

  const current = await loadDocumentText(actor.engagementId, ctx.produces);

  const body = `${inputPrompt(ctx)}\n\n---\n\n${commentsPrompt(current.body ?? "", open)}`;

  // Asked at most twice, and ONLY because answers ran over the length limit — the one problem saying it
  // again can fix. Anything else (a refusal, no tool call, an invented ref) is reported at once.
  let checked: ReturnType<typeof validateAnswers> | null = null;
  let retryNote = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let result;
    try {
      // Through the host seam, never a client built here — see `select.ts`.
      result = await selectHost().dispatch({
        model: MODEL,
        maxTokens: 8000,
        system: ctx.agentFile,
        tools: [ANSWER_TOOL],
        messages: [{ role: "user", content: body + retryNote }],
      });
    } catch (e) {
      return { ok: false, error: `Could not reach a model host: ${e instanceof Error ? e.message : String(e)}` };
    }

    if (result.stopReason === "refusal") {
      return { ok: false, error: `The model declined to answer. ${result.refusalExplanation ?? "No explanation given."}` };
    }
    const call = result.toolCall;
    if (!call || call.name !== ANSWER_TOOL.name) {
      return {
        ok: false,
        error: `The model answered without using \`${ANSWER_TOOL.name}\`${result.text ? `: ${result.text.slice(0, 300)}` : "."}`,
      };
    }

    checked = validateAnswers((call.input as { answers?: unknown })?.answers, open.map((c) => c.id));
    if (checked.ok || !checked.retry?.length) break;

    retryNote =
      `\n\nYour previous attempt was refused because ${checked.retry.length === 1 ? "an answer" : "answers"} ran over ` +
      `${MAX_ANSWER_CHARS} characters: ` +
      checked.retry.map((t) => `\`${t.id}\` was ${t.length}`).join(", ") +
      `. Answer every comment again, with each answer at most ${MAX_ANSWER_CHARS} characters — one or two sentences.`;
  }
  if (!checked || !checked.ok) return { ok: false, error: checked?.error ?? "The model returned no answers." };

  // The run took a while. If someone filed a new version meanwhile, these answers were written
  // against text that is gone — refuse rather than attach them to the wrong draft.
  const { data: now } = await sb.from("document").select("current_version_id").eq("id", doc.id).maybeSingle();
  if (now?.current_version_id !== startedOn) {
    return { ok: false, error: "The document was revised while the answers were being written. Run it again against the new version." };
  }

  const byId = new Map(open.map((c) => [c.id, c]));
  const { error } = await sb.from("document_comment").insert(
    checked.answers.map((a) => ({
      document_section_id: byId.get(a.commentId)!.sectionId,
      parent_id: a.commentId,
      quote: "",
      body: a.answer,
      author_kind: "agent",
      author_role_code: ctx.roleCode,
      author_user_id: null,
      stance: a.stance,
      overlaps_with: a.overlapsWith,
    })),
  );
  if (error) return { ok: false, error: error.message };

  await emit({
    engagementId: actor.engagementId,
    subjectType: "document",
    subjectId: doc.id as string,
    verb: "comment.answered",
    actorKind: "agent",
    actorRoleCode: ctx.roleCode,
    actorUserId: null,
    payload: { taskId, path: ctx.produces, answered: checked.answers.length },
  });

  return { ok: true, answered: checked.answers.length };
}

/** A top-level comment with everything said under it, as stored. */
export type Thread = {
  id: string;
  sectionId: string;
  heading: string;
  quote: string;
  body: string;
  author: string;
  status: "open" | "resolved";
  replies: {
    id: string; author: string; kind: "human" | "agent" | "system"; body: string;
    stance: "change" | "no_change" | null; decision: "accepted" | "declined" | null; decidedBy: string | null;
  }[];
};

/**
 * Every top-level comment on ANY version of a document, oldest first, with its replies.
 *
 * Across versions on purpose: a comment survives the edit it prompted, and one that still stands
 * must still be answered. Walks document → versions → sections → comments in separate reads for
 * the same reason `sectionInScope` does.
 */
export async function loadThreads(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>, documentId: string,
): Promise<Thread[]> {
  const { data: versions } = await sb.from("document_version").select("id").eq("document_id", documentId);
  const versionIds = (versions ?? []).map((v) => v.id as string);
  if (!versionIds.length) return [];

  const { data: sections } = await sb.from("document_section")
    .select("id, heading").in("document_version_id", versionIds);
  const headingOf = new Map((sections ?? []).map((s) => [s.id as string, s.heading as string]));
  if (!headingOf.size) return [];

  const { data: rows } = await sb.from("document_comment")
    .select("id, document_section_id, parent_id, quote, body, author_kind, author_user_id, author_role_code, status, stance, decision, decided_by, created_at")
    .in("document_section_id", [...headingOf.keys()]).order("created_at");

  const all = rows ?? [];
  const who = (r: { author_user_id: unknown; author_role_code: unknown }) =>
    (r.author_user_id ?? r.author_role_code ?? "someone") as string;

  const repliesOf = new Map<string, Thread["replies"]>();
  for (const r of all) {
    if (!r.parent_id) continue;
    repliesOf.set(r.parent_id as string, [...(repliesOf.get(r.parent_id as string) ?? []), {
      id: r.id as string, author: who(r), kind: r.author_kind as "human" | "agent" | "system",
      body: r.body as string, stance: (r.stance as "change" | "no_change" | null) ?? null,
      decision: (r.decision as "accepted" | "declined" | null) ?? null, decidedBy: (r.decided_by as string | null) ?? null,
    }]);
  }

  return all.filter((r) => !r.parent_id).map((r) => ({
    id: r.id as string,
    sectionId: r.document_section_id as string,
    heading: headingOf.get(r.document_section_id as string) ?? "",
    quote: r.quote as string,
    body: r.body as string,
    author: who(r),
    status: r.status as "open" | "resolved",
    replies: repliesOf.get(r.id as string) ?? [],
  }));
}

/**
 * Open comments waiting for an answer.
 *
 * A live answer is one nobody has declined: still undecided (waiting on a person), or accepted and
 * not yet applied (the comment resolves when the revision is filed). Either way, do not stack
 * another.
 */
async function openCommentsFor(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>, documentId: string,
): Promise<OpenComment[]> {
  return (await loadThreads(sb, documentId))
    .filter((t) => t.status === "open" && !t.replies.some((x) => x.stance && x.decision !== "declined"))
    .map((t) => ({
      id: t.id, sectionId: t.sectionId, heading: t.heading, quote: t.quote, body: t.body, author: t.author,
      thread: t.replies.map((x) => ({ author: x.author, kind: x.kind, body: x.body, decision: x.decision })),
    }));
}
