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
import { initiatePhase, openNested, nestedWorkflowOf } from "@/app/lib/data/phases";

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
): Promise<{ ok: boolean; error?: string; openedWorkflow?: string }> {
  const actor = await resolveActor(engagement, role);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  await measureTask(actor, taskId);

  const result = await startTask(actor, taskId);
  if (!result.ok) {
    revalidatePath(`/v2/e/${engagement}/jobs`);
    return { ok: false, error: result.error };
  }

  // A row whose dispatch is `workflow: <code>` is not agent work — starting it opens the CHILD run
  // that satisfies it, and that run's own steps are where the work happens. Without this the task
  // would sit at `running` forever with no agent able to pick it up, which is precisely how the
  // three graph-less workflows looked on Provider FFS.
  const nests = await nestedWorkflowOf(taskId);
  if (nests) {
    const child = await openNested(actor, taskId);
    revalidatePath(`/v2/e/${engagement}/jobs`);
    if (!child.ok) return { ok: false, error: child.error };
    return { ok: true, openedWorkflow: nests };
  }

  revalidatePath(`/v2/e/${engagement}/jobs`);
  return { ok: true };
}

/** Start a phase — basecamp or groundwork. Every row becomes a task in one run. */
export async function initiatePhaseAction(
  engagement: string, role: string, workflowCode: string,
): Promise<{ ok: boolean; error?: string; tasks?: number }> {
  const actor = await resolveActor(engagement, role);
  if (!actor) return { ok: false, error: "That role does not exist on this engagement." };

  const result = await initiatePhase(actor, workflowCode);
  revalidatePath(`/v2/e/${engagement}/jobs`);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, tasks: result.tasks.length };
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
