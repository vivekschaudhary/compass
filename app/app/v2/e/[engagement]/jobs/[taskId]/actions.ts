"use server";

// Server actions for the job view. Async exports only — every export here is a public endpoint.

import { revalidatePath } from "next/cache";
import { resolveActor } from "@/app/lib/data/actor";
import { recordAnswers } from "@/app/lib/data/job";
import { approve, reject } from "@/app/lib/data/gates";

/** Answer the agent's questions. The write itself lives in lib/data, which owns the scope check. */
export async function answerAction(
  engagement: string, role: string, taskId: string, answers: Record<string, string>,
): Promise<{ ok: boolean; error?: string; remaining?: number }> {
  const actor = await resolveActor(engagement, role);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await recordAnswers(actor, taskId, answers);
  revalidatePath(`/v2/e/${engagement}/jobs/${taskId}`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, remaining: result.remaining };
}

/** Approve the draft: confirm each Done criterion, then close. */
export async function approveAction(
  engagement: string, role: string, taskId: string, confirmed: string[],
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await approve(actor, taskId, confirmed);
  revalidatePath(`/v2/e/${engagement}/jobs/${taskId}`);
  revalidatePath(`/v2/e/${engagement}/jobs`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/** Send the draft back with reasons. The agent reads them on its next run. */
export async function rejectAction(
  engagement: string, role: string, taskId: string,
  rejections: { criterionId: string; reason: string }[],
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await reject(actor, taskId, rejections);
  revalidatePath(`/v2/e/${engagement}/jobs/${taskId}`);
  revalidatePath(`/v2/e/${engagement}/jobs`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}
