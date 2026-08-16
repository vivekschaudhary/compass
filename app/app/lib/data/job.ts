// Reads for the job view: the conversation, the open questions, and the draft with its provenance.

import "server-only";
import { supabaseAdmin } from "../supabase";
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
    .select("id, prompt").eq("task_id", taskId).eq("state", "open");

  const given = Object.entries(answers).filter(([, v]) => v.trim().length > 0);
  if (!given.length) return { ok: false, error: "Nothing to record." };

  const who = actor.holder ?? actor.roleCode;
  for (const [id, answer] of given) {
    await sb.from("question").update({
      answer, answered_by: who, answered_at: new Date().toISOString(), state: "answered",
    }).eq("id", id).eq("task_id", taskId);
  }

  const promptOf = new Map((open ?? []).map((q) => [q.id, q.prompt as string]));
  const body = given
    .map(([id, a]) => `**${(promptOf.get(id) ?? "question").split("\n")[0]}**\n${a}`)
    .join("\n\n");

  const { data: last } = await sb.from("turn").select("ord").eq("task_id", taskId)
    .order("ord", { ascending: false }).limit(1);
  await sb.from("turn").insert({
    task_id: taskId, ord: (last?.[0]?.ord ?? -1) + 1,
    author_kind: "human", author_role_code: actor.roleCode, author_user_id: who, body,
  });

  const remaining = Math.max(0, (open ?? []).length - given.length);
  if (remaining === 0) await sb.from("work_task").update({ state: "running" }).eq("id", taskId);
  return { ok: true, remaining };
}
