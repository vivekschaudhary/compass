"use server";

// Server actions for the jobs queue.
//
// EXPORTS ONLY ASYNC FUNCTIONS. A "use server" module's every export becomes a callable endpoint,
// so a stray constant or type export here is a public surface nobody meant to create —
// `[server-action-file-export-purity]`.

import { revalidatePath } from "next/cache";
import { resolveActor } from "@/app/lib/data/actor";
import { startTask } from "@/app/lib/data/tasks";
import { measureTask } from "@/app/lib/data/gates";

/**
 * Check the gate, then start.
 *
 * Measuring first is not a convenience — the database refuses to start a task whose Ready criteria
 * have no satisfied measurement, so this is what makes the click possible at all. It also means the
 * refusal, when it comes, is based on a check taken seconds ago rather than whenever someone last
 * looked.
 */
export async function startTaskAction(
  engagement: string, role: string, taskId: string,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  await measureTask(actor, taskId);

  const result = await startTask(actor, taskId);
  revalidatePath(`/v2/e/${engagement}/jobs`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/** Re-check the gate without starting anything. */
export async function recheckAction(
  engagement: string, role: string, taskId: string,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };
  await measureTask(actor, taskId);
  revalidatePath(`/v2/e/${engagement}/jobs`);
  return { ok: true };
}
