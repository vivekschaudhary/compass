// Resolving and reopening a comment, and counting what is still open.
//
// A comment is `open` or `resolved`, and that status — nothing else about it — is what stops a task
// being approved: `close_task` refuses while any top-level comment on the document the task gates is
// open (see migration `close_task_open_comments`). Anyone acting on the engagement may resolve or
// reopen; who did it is recorded. Only top-level comments have a status — a reply is part of the
// conversation under one and is never resolvable.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./actor";
import { emit } from "./events";
import { sectionInScope } from "./comments";

export type StatusResult = { ok: true } | { ok: false; error: string };

async function setStatus(
  actor: Actor, commentId: string, to: "resolved" | "open",
): Promise<StatusResult> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const { data: comment } = await sb.from("document_comment")
    .select("id, document_section_id, parent_id, status").eq("id", commentId).maybeSingle();
  if (!comment) return { ok: false, error: "That comment does not exist." };
  if (comment.parent_id) return { ok: false, error: "A reply is not resolved on its own — resolve the comment it answers." };
  if (!(await sectionInScope(sb, actor, comment.document_section_id as string))) {
    return { ok: false, error: "That comment is not in your engagement." };
  }
  if (comment.status === to) {
    return { ok: false, error: to === "resolved" ? "That comment is already resolved." : "That comment is already open." };
  }

  const who = actor.holder ?? actor.roleCode;
  const patch = to === "resolved"
    ? { status: "resolved", resolved_by: who, resolved_at: new Date().toISOString() }
    : { status: "open", resolved_by: null, resolved_at: null };

  // Guarded on the status it was read at, so two people clicking at once cannot both "win".
  const { data: updated, error } = await sb.from("document_comment")
    .update(patch).eq("id", commentId).eq("status", comment.status as string).select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: "Someone else changed that comment first." };

  await emit({
    engagementId: actor.engagementId,
    subjectType: "document_section",
    subjectId: comment.document_section_id as string,
    verb: to === "resolved" ? "comment.resolved" : "comment.reopened",
    actorKind: "human",
    actorRoleCode: actor.roleCode,
    actorUserId: who,
    payload: { commentId },
  });

  return { ok: true };
}

export const resolveComment = (actor: Actor, commentId: string) => setStatus(actor, commentId, "resolved");
export const reopenComment = (actor: Actor, commentId: string) => setStatus(actor, commentId, "open");

/**
 * How many open comments stand between this task and being approved — the database's own answer, so
 * what the page says and what `close_task` enforces cannot differ.
 *
 * Null, never zero, when it could not be asked. A failed read that came back as "none open" would
 * enable the very button the gate exists to hold back.
 */
export async function openCommentsBlocking(actor: Actor, taskId: string): Promise<number | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: task } = await sb.from("work_task")
    .select("id").eq("id", taskId).eq("engagement_id", actor.engagementId).maybeSingle();
  if (!task) return null;

  const { data, error } = await sb.rpc("task_open_comments", { p_task_id: taskId });
  if (error || typeof data !== "number") return null;
  return data;
}
