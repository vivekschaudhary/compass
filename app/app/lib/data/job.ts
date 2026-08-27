// Reads for the job view: the conversation, the open questions, and the draft with its provenance.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { emit } from "./events";
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

export type OpenQuestion = { id: string; prompt: string; type: string; options: string[] | null };

export type PastQuestion = { id: string; prompt: string; answer: string | null; state: string; reason: string | null };

/** Questions still blocking the task. There is no decline — an unanswered question stays. */
export async function openQuestions(taskId: string): Promise<OpenQuestion[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const { data } = await sb.from("question")
    .select("id, prompt, type, options").eq("task_id", taskId).eq("state", "open").order("created_at");
  return (data ?? []).map((q) => ({ id: q.id, prompt: q.prompt, type: q.type, options: q.options }));
}

export type Draft = {
  version: string; status: string;
  sections: { id: string; heading: string; body: string; cites: { path: string; version: string }[] }[];
};

/** The live version of what this task produces, with each section's citations resolved. */
export async function draftOf(actor: Actor, path: string | null): Promise<Draft | null> {
  const sb = supabaseAdmin();
  if (!sb || !path) return null;

  const { data: doc } = await sb.from("document")
    .select("current_version_id").eq("engagement_id", actor.engagementId).eq("path", path).maybeSingle();
  if (!doc?.current_version_id) return null;

  const { data: v } = await sb.from("document_version")
    .select("version, status").eq("id", doc.current_version_id).maybeSingle();
  if (!v) return null;

  const { data: sections } = await sb.from("document_section")
    .select("id, heading, body").eq("document_version_id", doc.current_version_id).order("ord");

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
    sections: (sections ?? []).map((s) => ({
      id: s.id, heading: s.heading, body: s.body, cites: bySection.get(s.id) ?? [],
    })),
  };
}

/**
 * Record answers to the agent's questions.
 *
 * Lives here rather than in the action because every write goes through this layer — the lint rule
 * that forbids a raw client in v2 exists so the engagement filter can never be forgotten at a call
 * site, and an answer write is no exception.
 *
 * Unanswered questions stay open. There is no decline: a question the agent needed does not stop
 * mattering because nobody felt like answering it, and the task stays `awaiting` until none remain.
 */
export async function recordAnswers(
  actor: Actor, taskId: string, answers: Record<string, string>,
): Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
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

  for (const [id, answer] of given) {
    await sb.from("question").update({
      answer, answered_by: who, answered_at: new Date().toISOString(), state: "answered",
    }).eq("id", id).eq("task_id", taskId);

    // An answer that IS a document is filed, unmodified.
    //
    // The alternative is the agent reading it out of a conversation turn and drafting it into the
    // document itself — which paraphrases. A summarised contract or requirement is the worst thing
    // this system could hold, because everything downstream cites it and none of them can tell they
    // are citing a summary.
    const path = filesToOf.get(id);
    if (path) await fileAnswer(actor, taskId, path, promptOf.get(id) ?? "Supplied material", answer, who);

    await emit({
      engagementId: actor.engagementId, subjectType: "question", subjectId: id,
      verb: "question.answered", actorKind: "human",
      actorRoleCode: actor.roleCode, actorUserId: who,
      payload: { taskId, prompt: promptOf.get(id) ?? null, answer },
    });
  }

  const body = [
    ...given.map(([id, a]) => `**${(promptOf.get(id) ?? "question").split("\n")[0]}**\n${a}`),
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
  return { ok: true, remaining };
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
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const text = body.trim();
  if (!text) return { ok: false, error: "Nothing to add." };

  const { data: task } = await sb.from("work_task")
    .select("id").eq("id", taskId).eq("engagement_id", actor.engagementId).maybeSingle();
  if (!task) return { ok: false, error: "That task is not in your engagement." };

  const { data: last } = await sb.from("turn").select("ord").eq("task_id", taskId)
    .order("ord", { ascending: false }).limit(1);

  const { error } = await sb.from("turn").insert({
    task_id: taskId, ord: (last?.[0]?.ord ?? -1) + 1,
    author_kind: "human", author_role_code: actor.roleCode,
    author_user_id: actor.holder ?? actor.roleCode, body: text,
  });
  if (error) return { ok: false, error: error.message };

  await emit({
    engagementId: actor.engagementId, subjectType: "task", subjectId: taskId,
    verb: "note.added", actorKind: "human",
    actorRoleCode: actor.roleCode, actorUserId: actor.holder ?? actor.roleCode,
    payload: { body: text },
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
): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;

  const { data: eng } = await sb.from("engagement").select("org_id").eq("id", actor.engagementId).maybeSingle();

  const { data: versionId, error } = await sb.rpc("file_document", {
    p_org_id: eng?.org_id ?? actor.orgId,
    p_engagement_id: actor.engagementId,
    p_path: path,
    p_title: prompt.split("\n")[0].slice(0, 200),
    p_sections: [{ heading: "As supplied", body: text }],
    p_version: null,
    p_actor: who,
    p_actor_role: actor.roleCode,
    p_owner_role: actor.roleCode,
    p_task_id: taskId,
  });

  if (error) {
    await addNote(actor, taskId, `Your answer was recorded, but filing it at \`${path}\` failed: ${error.message}`);
    return;
  }

  await emit({
    engagementId: actor.engagementId, subjectType: "document", subjectId: String(versionId),
    verb: "document.filed", actorKind: "human",
    actorRoleCode: actor.roleCode, actorUserId: who,
    payload: { taskId, path, source: "answer", chars: text.length },
  });
}
