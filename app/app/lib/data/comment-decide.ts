// A person's decision on the agent's answer to a comment: accept it, or decline it and say why.
//
// Accepting does NOT change the document. It records that this answer is the one to apply, and the
// revision that applies every accepted answer together is a separate act (`comment-revise.ts`) —
// comments overlap, and applying them one click at a time is how two fixes to one paragraph collide.
//
// Declining takes a REASON and a NEXT STEP, both required. A bare "no" leaves the agent nothing to
// work from the next time it answers, and leaves the reviewer guessing whether the objection was to
// the idea or the wording. Both are filed as an ordinary human reply under the comment, so the next
// answer is written with them in front of it.
//
// A decision is made once. Changing your mind is a new comment, not an edit of the record.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./actor";
import { emit } from "./events";
import { sectionInScope } from "./comments";

export type DecideResult = { ok: true } | { ok: false; error: string };

export async function decideAnswer(
  actor: Actor,
  answerId: string,
  decision: "accepted" | "declined",
  note?: { reason: string; next: string },
): Promise<DecideResult> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const reason = note?.reason.trim() ?? "";
  const next = note?.next.trim() ?? "";
  if (decision === "declined" && (!reason || !next)) {
    return { ok: false, error: "Say why it is declined and what should happen next." };
  }

  const { data: answer } = await sb.from("document_comment")
    .select("id, document_section_id, parent_id, stance, decision").eq("id", answerId).maybeSingle();
  if (!answer || !answer.parent_id || !answer.stance) {
    return { ok: false, error: "That is not an answer to a comment." };
  }
  if (!(await sectionInScope(sb, actor, answer.document_section_id as string))) {
    return { ok: false, error: "That comment is not in your engagement." };
  }
  if (answer.decision) return { ok: false, error: `That answer was already ${answer.decision}.` };

  const { data: parent } = await sb.from("document_comment")
    .select("status").eq("id", answer.parent_id as string).maybeSingle();
  if (parent?.status !== "open") return { ok: false, error: "That comment is already resolved." };

  const who = actor.holder ?? actor.roleCode;

  // The reply first: a decision recorded with no reason behind it is the failure this refuses.
  if (decision === "declined") {
    const { error } = await sb.from("document_comment").insert({
      document_section_id: answer.document_section_id,
      parent_id: answer.parent_id,
      quote: "",
      body: `Declined: ${reason}\n\nNext: ${next}`,
      author_kind: "human",
      author_role_code: actor.roleCode,
      author_user_id: who,
    });
    if (error) return { ok: false, error: error.message };
  }

  // `is null` makes this a no-op if someone decided in the meantime, and `select` shows whether it was.
  const { data: updated, error } = await sb.from("document_comment")
    .update({ decision, decided_by: who, decided_at: new Date().toISOString() })
    .eq("id", answerId).is("decision", null).select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: "Someone else decided that answer first." };

  await emit({
    engagementId: actor.engagementId,
    subjectType: "document_section",
    subjectId: answer.document_section_id as string,
    verb: decision === "accepted" ? "comment.answer_accepted" : "comment.answer_declined",
    actorKind: "human",
    actorRoleCode: actor.roleCode,
    actorUserId: who,
    payload: { commentId: answer.parent_id, answerId, ...(decision === "declined" ? { reason, next } : {}) },
  });

  return { ok: true };
}
