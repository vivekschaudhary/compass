"use server";

// Server actions for the job view. Async exports only — every export here is a public endpoint.

import { revalidatePath } from "next/cache";
import { resolveActor } from "@/app/lib/data/actor";
import { recordAnswers, addNote, resumeForReview } from "@/app/lib/data/job";
import { approve, reject } from "@/app/lib/data/gates";
import { editSection } from "@/app/lib/data/document-edit";
import { addComment } from "@/app/lib/data/comments";

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
