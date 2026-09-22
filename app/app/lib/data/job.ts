// Reads for the job view: the conversation, the open questions, and the draft with its provenance.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { emit } from "./events";
import { expandLinks, type LinkRead } from "./links";
import { publishToDocs } from "./publish";
import type { Actor } from "./actor";

export type Turn = {
  id: string; ord: number; authorKind: string;
  authorRoleCode: string | null; authorUserId: string | null;
  body: string; createdAt: string;
};

export async function conversation(taskId: string): Promise<Turn[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const { data } = await sb.from("turn")
    .select("id, ord, author_kind, author_role_code, author_user_id, body, created_at")
    .eq("task_id", taskId).order("ord");
  return (data ?? []).map((t) => ({
    id: t.id, ord: t.ord, authorKind: t.author_kind,
    authorRoleCode: t.author_role_code, authorUserId: t.author_user_id,
    body: t.body, createdAt: t.created_at,
  }));
}

/**
 * `filesTo` is the path this question's answer BECOMES a document at.
 *
 * It has always been on the row and read inside `recordAnswers`; the UI simply never saw it, so the
 * one question that wants a contract looked exactly like the one asking how many engineers there
 * are — and the only way to answer it was to paste, which is how a Word table becomes a column of
 * words. The form needs this to know where to offer an upload.
 */
export type OpenQuestion = {
  id: string; prompt: string; type: string; options: string[] | null; filesTo: string | null;
};

export type PastQuestion = { id: string; prompt: string; answer: string | null; state: string; reason: string | null };

/**
 * A document this answer filed, and where it was published.
 *
 * Returned so the caller can act on the page that now exists — attaching the uploaded original to
 * it, in the upload path. `fileAnswer` used to swallow all of this, which is why nothing could.
 */
export type FiledAnswer = {
  questionId: string;
  path: string;
  versionId: string;
  /** The doc-store page id and URL, when publishing succeeded. Null when it did not. */
  externalId: string | null;
  externalUrl: string | null;
};

/** Questions still blocking the task. There is no decline — an unanswered question stays. */
export async function openQuestions(taskId: string): Promise<OpenQuestion[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const { data } = await sb.from("question")
    .select("id, prompt, type, options, files_to")
    .eq("task_id", taskId).eq("state", "open").order("created_at");
  return (data ?? []).map((q) => ({
    id: q.id, prompt: q.prompt, type: q.type, options: q.options,
    filesTo: (q.files_to as string | null) ?? null,
  }));
}

export type Draft = {
  version: string; status: string;
  /** `human` when a person filed this version. `agent` for every version a run produced. */
  authorKind: "agent" | "human";
  /** Who filed it — the holder's name when a person did, null for an agent's draft. */
  authoredBy: string | null;
  sections: {
    id: string; heading: string; body: string;
    cites: { path: string; version: string }[];
    /**
     * A person rewrote this section's prose.
     *
     * Shown because the citations beneath it describe what the AGENT derived, and once a human has
     * rewritten the text those sources no longer account for it. Provenance that reads as verified
     * and is not is worse than none.
     */
    edited: boolean;
  }[];
};

/** The live version of what this task produces, with each section's citations resolved. */
export async function draftOf(actor: Actor, path: string | null): Promise<Draft | null> {
  const sb = supabaseAdmin();
  if (!sb || !path) return null;

  const { data: doc } = await sb.from("document")
    .select("current_version_id").eq("engagement_id", actor.engagementId).eq("path", path).maybeSingle();
  if (!doc?.current_version_id) return null;

  const { data: v } = await sb.from("document_version")
    .select("version, status, author_kind, authored_by").eq("id", doc.current_version_id).maybeSingle();
  if (!v) return null;

  const { data: sections } = await sb.from("document_section")
    .select("id, heading, body, edited").eq("document_version_id", doc.current_version_id).order("ord");

  const ids = (sections ?? []).map((s) => s.id);
  const { data: cites } = ids.length
    ? await sb.from("citation")
        .select("document_section_id, locator, document_version!source_version_id(version)").in("document_section_id", ids)
    : { data: [] };

  type CiteRow = { document_section_id: string; locator: string | null; document_version: { version: string } | { version: string }[] | null };
  const bySection = new Map<string, { path: string; version: string }[]>();
  for (const c of (cites ?? []) as unknown as CiteRow[]) {
    const dv = Array.isArray(c.document_version) ? c.document_version[0] : c.document_version;
    const entry = { path: c.locator ?? "source", version: dv?.version ?? "?" };
    bySection.set(c.document_section_id, [...(bySection.get(c.document_section_id) ?? []), entry]);
  }

  return {
    version: v.version, status: v.status,
    authorKind: (v.author_kind as "agent" | "human") ?? "agent",
    authoredBy: (v.authored_by as string | null) ?? null,
    sections: (sections ?? []).map((s) => ({
      id: s.id, heading: s.heading, body: s.body, cites: bySection.get(s.id) ?? [],
      edited: s.edited === true,
    })),
  };
}

/**
 * Record answers to the agent's questions.
 *
 * Lives here rather than in the action because every write goes through this layer — the lint rule
 * that forbids a raw client outside lib/ exists so the engagement filter can never be forgotten at a call
 * site, and an answer write is no exception.
 *
 * Unanswered questions stay open. There is no decline: a question the agent needed does not stop
 * mattering because nobody felt like answering it, and the task stays `awaiting` until none remain.
 */
export async function recordAnswers(
  actor: Actor, taskId: string, answers: Record<string, string>,
  /**
   * Answers whose document came from an uploaded FILE rather than from what was typed.
   *
   * Two texts, not one, and that is the whole reason this argument exists. `text` is the document —
   * a contract, filed verbatim at the question's `files_to`. `answers[id]` is the short reference
   * that goes on the record and into the conversation the agent replays. Collapsing them would put
   * a forty-page SOW in the turn AND pin it as an input, handing the agent the same contract twice;
   * the sole-link case already takes exactly this shape for exactly this reason.
   */
  uploads: Record<string, { filename: string; bytes: number; text: string }> = {},
): Promise<
  | { ok: true; remaining: number; filed: FiledAnswer[] }
  | { ok: false; error: string }
> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  // Scope check first: an answer is a write, and a task id from another engagement must not take.
  const { data: task } = await sb.from("work_task")
    .select("id").eq("id", taskId).eq("engagement_id", actor.engagementId).maybeSingle();
  if (!task) return { ok: false, error: "That task is not in your engagement." };

  const { data: open } = await sb.from("question")
    .select("id, prompt, optional, files_to").eq("task_id", taskId).eq("state", "open");

  const given = Object.entries(answers).filter(([, v]) => v.trim().length > 0);
  // An OPTIONAL question the human left blank is a decision, not an omission.
  //
  // "Do you have business requirements?" must be answerable with silence, and silence must settle
  // it — otherwise the task sits in `awaiting` for ever on a question nobody intends to answer, and
  // that is indistinguishable from waiting on one that matters. Declined, not answered: the record
  // has to keep saying nobody supplied anything.
  const declined = (open ?? []).filter(
    (q) => q.optional && !(answers[q.id] ?? "").trim(),
  );
  if (!given.length && !declined.length) return { ok: false, error: "Nothing to record." };

  const who = actor.holder ?? actor.roleCode;
  const promptOf = new Map((open ?? []).map((q) => [q.id, q.prompt as string]));
  const filesToOf = new Map((open ?? []).map((q) => [q.id, (q.files_to as string | null) ?? null]));

  // Read every link BEFORE writing anything. An agent cannot open a URL, so an answer that is a link
  // has to arrive as what the link says — and if one does not open, the person is told now and
  // nothing is half-recorded, so they can paste the text instead.
  const expanded = new Map<string, Extract<Awaited<ReturnType<typeof expandLinks>>, { ok: true }>>();
  const refusals: string[] = [];
  await Promise.all(given.map(async ([id, answer]) => {
    const r = await expandLinks(answer);
    if (r.ok) expanded.set(id, r);
    else refusals.push(r.error);
  }));
  if (refusals.length) return { ok: false, error: refusals.join(" ") };

  for (const q of declined) {
    await sb.from("question").update({
      state: "superseded", superseded_at: new Date().toISOString(),
      superseded_reason: `${who} had nothing to supply for this.`,
    }).eq("id", q.id).eq("task_id", taskId);

    await emit({
      engagementId: actor.engagementId, subjectType: "question", subjectId: q.id,
      verb: "question.declined", actorKind: "human",
      actorRoleCode: actor.roleCode, actorUserId: who,
      payload: { taskId, prompt: q.prompt, optional: true },
    });
  }

  // What each answer contributes to the conversation turn.
  const turnText = new Map<string, string>();
  /** The documents these answers filed, for a caller that has to act on the published page. */
  const filed: FiledAnswer[] = [];

  for (const [id, answer] of given) {
    // The answer stays as typed: the link is the provenance, and the record shows what was given.
    await sb.from("question").update({
      answer, answered_by: who, answered_at: new Date().toISOString(), state: "answered",
    }).eq("id", id).eq("task_id", taskId);

    const read = expanded.get(id)!;

    // An answer that IS a document is filed, unmodified.
    //
    // The alternative is the agent reading it out of a conversation turn and drafting it into the
    // document itself — which paraphrases. A summarised contract or requirement is the worst thing
    // this system could hold, because everything downstream cites it and none of them can tell they
    // are citing a summary.
    //
    // An answer that is ONE LINK and nothing else is filed as what the link says, not as the URL.
    // Filing the URL would give every downstream row a document whose whole body is a string it
    // cannot open.
    const path = filesToOf.get(id);
    const soleLink = read.reads.length === 1 && answer.trim() === read.reads[0].url ? read.reads[0] : null;
    // An UPLOAD is a third source for the same document, beside typed text and a link that was
    // read. Its text never passes through `answer`, so it is taken from here.
    const upload = uploads[id];
    if (path) {
      const result = await fileAnswer(
        actor, taskId, path, promptOf.get(id) ?? "Supplied material",
        upload ? upload.text : soleLink ? soleLink.text : answer,
        who, soleLink?.finalUrl ?? null,
      );
      if (result) filed.push({ questionId: id, path, ...result });
    }

    // A document filed from a link or a file is already the agent's input, pinned at `path`;
    // repeating its text in the conversation would hand the agent the same contract twice.
    turnText.set(id, path && upload
      ? `${answer}\n\n_Read ${upload.text.length.toLocaleString()} characters from \`${upload.filename}\` and filed them at \`${path}\`._`
      : path && soleLink
        ? `${answer}\n\n_Read ${soleLink.text.length.toLocaleString()} characters from the link and filed them at \`${path}\`._`
        : read.text);

    await emit({
      engagementId: actor.engagementId, subjectType: "question", subjectId: id,
      verb: "question.answered", actorKind: "human",
      actorRoleCode: actor.roleCode, actorUserId: who,
      payload: { taskId, prompt: promptOf.get(id) ?? null, answer, links: read.links },
    });
  }

  const body = [
    ...given.map(([id, a]) => `**${(promptOf.get(id) ?? "question").split("\n")[0]}**\n${turnText.get(id) ?? a}`),
    ...declined.map((q) => `**${String(q.prompt).split("\n")[0]}**\n_Nothing to supply._`),
  ].join("\n\n");

  const { data: last } = await sb.from("turn").select("ord").eq("task_id", taskId)
    .order("ord", { ascending: false }).limit(1);
  await sb.from("turn").insert({
    task_id: taskId, ord: (last?.[0]?.ord ?? -1) + 1,
    author_kind: "human", author_role_code: actor.roleCode, author_user_id: who, body,
  });

  const remaining = Math.max(0, (open ?? []).length - given.length - declined.length);
  if (remaining === 0) await sb.from("work_task").update({ state: "running" }).eq("id", taskId);
  return { ok: true, remaining, filed };
}

/**
 * Questions that are no longer waiting on anyone — answered, or superseded when the agent drafted
 * without them. Shown as history so the record reads honestly: a question that was worked around
 * is a different fact from one that was resolved, and both are worth being able to see.
 */
export async function settledQuestions(taskId: string): Promise<PastQuestion[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const { data } = await sb.from("question")
    .select("id, prompt, answer, state, superseded_reason")
    .eq("task_id", taskId).neq("state", "open").order("created_at");
  return (data ?? []).map((q) => ({
    id: q.id, prompt: q.prompt, answer: q.answer, state: q.state, reason: q.superseded_reason,
  }));
}

/** Where the task is, for deciding what the job view should offer. */
/**
 * Why a nesting row is still open after its nested run finished.
 *
 * `close_parent_task_when_child_run_closes` calls `close_task`, and when a Done criterion is unmet
 * it catches the exception — it has to, because raising inside an AFTER trigger would roll back the
 * CHILD's close too, and finishing nested work would appear to do nothing. The reason went into a
 * `task.child_run_closed_gate_not_met` event and no further: the row simply sat open, looking stuck,
 * with the explanation only in the log.
 *
 * Newest event only, and just its reason. Null is the ordinary case — most rows never blocked.
 */
export async function childRunBlock(actor: Actor, taskId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("event")
    .select("payload, occurred_at")
    .eq("engagement_id", actor.engagementId)
    .eq("subject_type", "task").eq("subject_id", taskId)
    .eq("verb", "task.child_run_closed_gate_not_met")
    .order("occurred_at", { ascending: false }).limit(1).maybeSingle();

  const reason = (data?.payload as { reason?: string } | null)?.reason;
  return reason?.trim() || null;
}

export async function taskState(actor: Actor, taskId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("work_task")
    .select("state").eq("id", taskId).eq("engagement_id", actor.engagementId).maybeSingle();
  return data?.state ?? null;
}

/**
 * Say something on a task, whatever state it is in.
 *
 * A closed task's conversation was readable and nothing more — the record went quiet the moment
 * the work finished, which is precisely when people start asking about it. A note here does NOT
 * reopen the task and does not touch its state: closing is a statement about the work, not about
 * whether anyone may still discuss it.
 *
 * On a task that is still open the note lands in the conversation the agent replays on its next
 * run, so it is also how you tell it something without answering a question it asked.
 */
export async function addNote(
  actor: Actor, taskId: string, body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Nothing to add." };

  // Scope before fetching: a task id from another engagement must not make Compass open anything.
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };
  const { data: task } = await sb.from("work_task")
    .select("id").eq("id", taskId).eq("engagement_id", actor.engagementId).maybeSingle();
  if (!task) return { ok: false, error: "That task is not in your engagement." };

  // Links in a note are read before it is written, for the same reason as an answer: the agent
  // replays this turn and cannot open a URL in it.
  const read = await expandLinks(text);
  if (!read.ok) return { ok: false, error: read.error };

  return writeNote(actor, taskId, text, read.text, read.links);
}

/**
 * The write behind a note, with no link reading.
 *
 * Separate so Compass's own notes — "filing your answer failed" — go straight in. A system message
 * that happened to quote a URL must never be refused because that URL did not open.
 */
/**
 * Compass saying something on the task in its own name.
 *
 * The exported face of `writeNote`, for the failures that are not the caller's to explain away — a
 * publish that did not land, an original that did not attach. No link reading: a system message
 * that happens to quote a URL must never be refused because that URL did not open.
 */
export async function noteFromCompass(
  actor: Actor, taskId: string, message: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return writeNote(actor, taskId, message, message, []);
}

async function writeNote(
  actor: Actor, taskId: string, typed: string, body: string, links: LinkRead[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const { data: task } = await sb.from("work_task")
    .select("id").eq("id", taskId).eq("engagement_id", actor.engagementId).maybeSingle();
  if (!task) return { ok: false, error: "That task is not in your engagement." };

  const { data: last } = await sb.from("turn").select("ord").eq("task_id", taskId)
    .order("ord", { ascending: false }).limit(1);

  const { error } = await sb.from("turn").insert({
    task_id: taskId, ord: (last?.[0]?.ord ?? -1) + 1,
    author_kind: "human", author_role_code: actor.roleCode,
    author_user_id: actor.holder ?? actor.roleCode, body,
  });
  if (error) return { ok: false, error: error.message };

  await emit({
    engagementId: actor.engagementId, subjectType: "task", subjectId: taskId,
    verb: "note.added", actorKind: "human",
    actorRoleCode: actor.roleCode, actorUserId: actor.holder ?? actor.roleCode,
    // The note as typed, not with every linked page inlined into the event log.
    payload: { body: typed, links },
  });
  return { ok: true };
}

/**
 * File a supplied answer as a document, verbatim.
 *
 * Through the same `file_document` routine an agent's own draft uses, so the text becomes a real
 * versioned document with a path — citable, readable by the next step's `reads`, and visible in the
 * content tree. What it does NOT go through is a model: the whole point is that a BRD, a contract or
 * an existing backlog lands as the person sent it.
 *
 * One section, because the supplier's own structure is inside the text and re-sectioning it here
 * would be an edit. `owner_role` is the HUMAN's role — they supplied it, and attributing it to the
 * agent that asked would put an author's name on someone else's document.
 *
 * Failure is recorded as a note on the task rather than thrown: the answer is already saved on the
 * question, so nothing is lost, and refusing to record an answer because filing failed would be a
 * worse outcome than a missing document.
 */
async function fileAnswer(
  actor: Actor, taskId: string, path: string, prompt: string, text: string, who: string,
  /** The URL the text was read from, when the answer was a link. */
  source: string | null = null,
): Promise<Omit<FiledAnswer, "questionId" | "path"> | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: eng } = await sb.from("engagement").select("org_id").eq("id", actor.engagementId).maybeSingle();

  // NAMED BY THE ROW, not by the question that asked for it.
  //
  // This used to title the document with the agent's prompt, which was the only thing to hand and
  // harmless while nothing published. Once `fileAnswer` started publishing, a client's SOW appeared
  // in Confluence titled "What's the Statement of Work for this engagement? Please paste the text
  // or share a link…". The draft path has always used the row's title (`ctx.taskTitle` in
  // `run.ts`); two filing paths had two sources for one fact and the wrong one reached the client.
  //
  // NULL WHEN THE DOCUMENT ALREADY EXISTS. `file_document` does `title = coalesce(p_title, title)`,
  // so passing a title overwrites on every version — a re-supply would rename a page somebody had
  // since titled properly. `editSection` passes the document's own title for the same reason.
  const { data: held } = await sb.from("document")
    .select("id").eq("engagement_id", actor.engagementId).eq("path", path).maybeSingle();
  const { data: task } = held
    ? { data: null }
    : await sb.from("work_task").select("title").eq("id", taskId).maybeSingle();

  const { data: versionId, error } = await sb.rpc("file_document", {
    p_org_id: eng?.org_id ?? actor.orgId,
    p_engagement_id: actor.engagementId,
    p_path: path,
    // The prompt is not lost: it is on the `question` row and in the turn, which is where a
    // question belongs. It was never the document's name.
    p_title: held ? null : ((task?.title as string | undefined) ?? path),
    p_sections: [{ heading: "As supplied", body: text }],
    p_version: null,
    p_actor: who,
    p_actor_role: actor.roleCode,
    p_owner_role: actor.roleCode,
    p_task_id: taskId,
  });

  if (error) {
    const msg = `Your answer was recorded, but filing it at \`${path}\` failed: ${error.message}`;
    await writeNote(actor, taskId, msg, msg, []);
    return null;
  }

  await emit({
    engagementId: actor.engagementId, subjectType: "document", subjectId: String(versionId),
    verb: "document.filed", actorKind: "human",
    actorRoleCode: actor.roleCode, actorUserId: who,
    payload: { taskId, path, source: "answer", chars: text.length, ...(source ? { url: source } : {}) },
  });

  // AND PUBLISH IT. Filing puts the document in Compass; publishing is what makes it visible to
  // everyone who does not open Compass, which `[docs-primary]` says is the point of having a doc
  // store at all.
  //
  // This was missing, and the gap was invisible for a long time: only `runAgent`'s draft path
  // published, and `fileAnswer` effectively never ran because `filesTo` rejects every bare path
  // this seed uses (`sow`, `requirements`) — it demands `0X-folder/name`. The moment a supplied
  // row filed a real document the hole appeared: a SOW correctly stored in Compass, its row closed,
  // and nothing in Confluence. `published_to_docs_at` was null and `publish_error` was null too —
  // not a failed publish, one nobody attempted.
  //
  // A failure is REPORTED, not thrown. The document is filed and good; what failed is the
  // projection, and `publishToDocs` already records it on the version so it can be retried.
  const published = await publishToDocs(actor.engagementId, versionId as string);
  if (!published.ok) {
    const msg =
      `\`${path}\` is filed in Compass, but publishing it to the doc store failed: ` +
      `${published.error}\n\nThe document is complete and versioned here; it is not yet visible ` +
      `to anyone reading the doc store.`;
    await writeNote(actor, taskId, msg, msg, []);
  }

  // The page the caller may still have something to put ON — an uploaded original, in the upload
  // path. Null on the publish failure above, so a caller cannot attach to a page that is not there.
  return {
    versionId: versionId as string,
    externalId: published.ok ? published.id ?? null : null,
    externalUrl: published.ok ? published.url ?? null : null,
  };
}
