"use server";

// Server actions for the job view. Async exports only — every export here is a public endpoint.

import { revalidatePath } from "next/cache";
import { resolveActor } from "@/app/lib/data/actor";
import {
  recordAnswers, addNote, resumeForReview, resetStalledRun, conversationFor, type Turn,
} from "@/app/lib/data/job";
import { approve, reject } from "@/app/lib/data/gates";
import { editSection } from "@/app/lib/data/document-edit";
import { addComment } from "@/app/lib/data/comments";
import { respondToComments } from "@/app/lib/agent/comment-respond";
import { applyAcceptedAnswers } from "@/app/lib/agent/comment-revise";
import { decideAnswer } from "@/app/lib/data/comment-decide";
import { resolveComment, reopenComment } from "@/app/lib/data/comment-status";

/** Answer the agent's questions. The write itself lives in lib/data, which owns the scope check. */
export async function answerAction(
  engagement: string, role: string, taskId: string, answers: Record<string, string>,
  holderId?: string | null,
): Promise<{ ok: boolean; error?: string; remaining?: number }> {
  const actor = await resolveActor(engagement, role, holderId);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await recordAnswers(actor, taskId, answers);
  revalidatePath(`/e/${engagement}/jobs/${taskId}`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, remaining: result.remaining };
}

/** Approve the draft: confirm each Done criterion, then close. */
export async function approveAction(
  engagement: string, role: string, taskId: string, confirmed: string[],
  holderId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role, holderId);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await approve(actor, taskId, confirmed);
  revalidatePath(`/e/${engagement}/jobs/${taskId}`);
  revalidatePath(`/e/${engagement}/jobs`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/** Send the draft back with reasons. The agent reads them on its next run. */
export async function rejectAction(
  engagement: string, role: string, taskId: string,
  rejections: { criterionId: string; reason: string }[],
  holderId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role, holderId);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await reject(actor, taskId, rejections);
  revalidatePath(`/e/${engagement}/jobs/${taskId}`);
  revalidatePath(`/e/${engagement}/jobs`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/**
 * Rewrite one section of the draft, as a new version authored by this person.
 *
 * The point of offering this at all: the alternative is someone editing the Confluence page, where
 * the change has no author, no version and no trail, and the next publish silently overwrites it.
 */
export async function editSectionAction(
  engagement: string, role: string, taskId: string,
  path: string, sectionId: string, body: string,
  holderId?: string | null,
): Promise<{ ok: boolean; error?: string; version?: string }> {
  const actor = await resolveActor(engagement, role, holderId);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await editSection(actor, taskId, path, sectionId, body);
  revalidatePath(`/e/${engagement}/jobs/${taskId}`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, version: result.version };
}

/**
 * Comment on the text a reviewer (or the owner) just selected. Not restricted to a review task —
 * see `document_comment`'s own migration header for why: sections are per document version, not
 * per task, so the same section can be commented from any task that currently reads it.
 */
export async function addCommentAction(
  engagement: string, role: string, taskId: string, sectionId: string, quote: string, body: string,
  holderId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role, holderId);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await addComment(actor, sectionId, quote, body);
  revalidatePath(`/e/${engagement}/jobs/${taskId}`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/**
 * Have the drafter's agent answer every open comment on this task's document, briefly. Does not
 * reopen the task, claim it, or file a version — it writes one reply per comment and stops; see
 * `comment-respond.ts` for why it is not a run.
 */
export async function respondToCommentsAction(
  engagement: string, role: string, taskId: string,
  holderId?: string | null,
): Promise<{ ok: boolean; error?: string; answered?: number }> {
  const actor = await resolveActor(engagement, role, holderId);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await respondToComments(actor, taskId);
  revalidatePath(`/e/${engagement}/jobs/${taskId}`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, answered: result.answered };
}

/** Accept the agent's answer to a comment, or decline it with a reason and a next step. */
export async function decideAnswerAction(
  engagement: string, role: string, taskId: string, answerId: string,
  decision: "accepted" | "declined", note?: { reason: string; next: string },
  holderId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role, holderId);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await decideAnswer(actor, answerId, decision, note);
  revalidatePath(`/e/${engagement}/jobs/${taskId}`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/**
 * Apply every accepted answer as ONE new version of the document, and resolve what it settled. Does
 * not reopen the task — see `comment-revise.ts`.
 */
export async function applyAcceptedAnswersAction(
  engagement: string, role: string, taskId: string,
  holderId?: string | null,
): Promise<{ ok: boolean; error?: string; version?: string | null; resolved?: number; note?: string }> {
  const actor = await resolveActor(engagement, role, holderId);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await applyAcceptedAnswers(actor, taskId);
  revalidatePath(`/e/${engagement}/jobs/${taskId}`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, version: result.version, resolved: result.resolved, note: result.note };
}

/**
 * Mark a comment resolved, or open it again. Anyone on the engagement may; who did it is recorded.
 * A task cannot be approved while any comment on its document is open.
 */
export async function setCommentStatusAction(
  engagement: string, role: string, taskId: string, commentId: string,
  to: "resolved" | "open",
  holderId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role, holderId);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = to === "resolved" ? await resolveComment(actor, commentId) : await reopenComment(actor, commentId);
  revalidatePath(`/e/${engagement}/jobs/${taskId}`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/**
 * The conversation alone, for the lightweight refresh — no `revalidatePath`, deliberately: refetching
 * the turns list is the one thing this must NOT trigger a full page refresh to get, that being the
 * entire reason it exists (see `OptimisticTurns.tsx`). `conversationFor`, not `conversation`,
 * because a server action is reachable directly from the client with just a `taskId` — the
 * engagement-scope check that a page's own `resolveActor`/`buildContext` chain already did has to be
 * redone here rather than assumed.
 */
export async function getConversationAction(
  engagement: string, role: string, taskId: string,
  holderId?: string | null,
): Promise<{ ok: true; turns: Turn[] } | { ok: false; error: string }> {
  const actor = await resolveActor(engagement, role, holderId);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  return { ok: true, turns: await conversationFor(actor, taskId) };
}

/** Add a message to the conversation. Never changes the task's state. */
export async function noteAction(
  engagement: string, role: string, taskId: string, body: string,
  holderId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role, holderId);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await addNote(actor, taskId, body);
  revalidatePath(`/e/${engagement}/jobs/${taskId}`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/**
 * Reset a run that's been stalled for a while — the one manual action available once the sweep
 * hasn't caught it yet. See `resetStalledRun`'s own doc comment for the safety condition.
 */
export async function resetStalledRunAction(
  engagement: string, role: string, taskId: string,
  holderId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role, holderId);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await resetStalledRun(actor, taskId);
  revalidatePath(`/e/${engagement}/jobs/${taskId}`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/**
 * Resume a task paused for approval, so the composer can prompt the agent again after a plain
 * chat message — `runAgent` itself refuses on anything but `state: "running"`, and a note alone
 * never moves it there (see `addNote`'s own doc comment). Called right before `requestRun`, never
 * on its own; a no-op wherever the task is not currently `hitl`.
 */
export async function resumeForReviewAction(
  engagement: string, role: string, taskId: string,
  holderId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role, holderId);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await resumeForReview(actor, taskId);
  revalidatePath(`/e/${engagement}/jobs/${taskId}`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}
