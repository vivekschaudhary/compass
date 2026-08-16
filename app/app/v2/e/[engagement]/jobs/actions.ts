"use server";

// Server actions for the jobs queue.
//
// EXPORTS ONLY ASYNC FUNCTIONS. A "use server" module's every export becomes a callable endpoint,
// so a stray constant or type export here is a public surface nobody meant to create —
// `[server-action-file-export-purity]`, one of the two prod-only defects that got past 541 tests
// and every local check on a previous consumer project.

import { revalidatePath } from "next/cache";
import { resolveActor } from "@/app/lib/data/actor";
import { startTask } from "@/app/lib/data/tasks";

export async function startTaskAction(
  engagement: string, role: string, taskId: string,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  // Scope is checked inside startTask — a task id from another engagement is refused there rather
  // than trusted here.
  const result = await startTask(actor, taskId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/v2/e/${engagement}/jobs`);
  return { ok: true };
}
