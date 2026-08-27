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
import {
  initiatePhase,
  openNested,
  nestedWorkflowOf,
  remirrorPhase,
} from "@/app/lib/data/phases";
import { mirrorIncomplete } from "@/app/lib/data/tracker";
import { composeIncomplete } from "@/app/lib/data/ticket-body";
import type { BoardResult } from "@/app/lib/data/phases";

// NOT exported — see the header. A type export is erased at build time, but a value export here
// would become an endpoint, and keeping both local means the rule needs no exception.
type Board = {
  epic: string | null;
  stories: number;
  expected: number;
  problems: string[];
  incomplete: boolean;
  /**
   * The editorial half, reported apart from the structural one.
   *
   * `stories: 11` used to be the whole answer, and it stayed 11 whether every ticket read as the
   * product or every one of them still carried its placeholder. `written` is how many say something.
   */
  bodies?: { written: number; expected: number; problems: string[]; incomplete: boolean };
};

function board(m: BoardResult): Board {
  return {
    epic: m.epic,
    stories: m.stories.length,
    expected: m.expected,
    problems: m.problems,
    incomplete: mirrorIncomplete(m),
    bodies: m.composed
      ? {
          written: m.composed.written.length,
          expected: m.composed.expected,
          problems: m.composed.problems,
          incomplete: composeIncomplete(m.composed),
        }
      : undefined,
  };
}

/**
 * Check the gate, then start.
 *
 * Measuring first is not a convenience — the database refuses to start a task whose Ready criteria
 * have no satisfied measurement, so this is what makes the click possible at all. It also means the
 * refusal, when it comes, is based on a check taken seconds ago rather than whenever someone last
 * looked.
 */
export async function startTaskAction(
  engagement: string,
  role: string,
  taskId: string,
): Promise<{ ok: boolean; error?: string; openedWorkflow?: string }> {
  const actor = await resolveActor(engagement, role);
  if (!actor)
    return { ok: false, error: "That role does not exist on this engagement." };

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

/**
 * Start a phase. Every row becomes a task in one run, and every task a story on the board.
 *
 * The board result is RETURNED. It used to be dropped here — `initiatePhase` came back carrying
 * "could not create the epic in TEST1" and this returned `{ ok: true, tasks: 13 }`, so a phase that
 * never reached Jira looked exactly like one that did. The work is not finished until the tracker
 * has it, and a caller that cannot see the difference cannot say so.
 */
export async function initiatePhaseAction(
  engagement: string,
  role: string,
  workflowCode: string,
): Promise<{
  ok: boolean;
  error?: string;
  tasks?: number;
  board?: Board;
}> {
  const actor = await resolveActor(engagement, role);
  if (!actor)
    return { ok: false, error: "That role does not exist on this engagement." };

  const result = await initiatePhase(actor, workflowCode);
  revalidatePath(`/v2/e/${engagement}/jobs`);
  if (!result.ok) return { ok: false, error: result.error };

  const m = result.mirrored;
  return { ok: true, tasks: result.tasks.length, board: m ? board(m) : undefined };
}

/**
 * Try the board again for a phase that is already open.
 *
 * Idempotent all the way down — `mirrorPhase` reuses the keys Compass already stored, so pressing
 * this on a fully mirrored phase creates nothing.
 */
export async function mirrorPhaseAction(
  engagement: string,
  role: string,
  runId: string,
): Promise<{
  ok: boolean;
  error?: string;
  board?: Board;
}> {
  const actor = await resolveActor(engagement, role);
  if (!actor)
    return { ok: false, error: "That role does not exist on this engagement." };

  const result = await remirrorPhase(actor, runId);
  revalidatePath(`/v2/e/${engagement}/jobs`);
  if (!result.ok) return { ok: false, error: result.error };

  return { ok: true, board: board(result.mirrored) };
}

/** Re-check the gate without starting anything. */
export async function recheckAction(
  engagement: string,
  role: string,
  taskId: string,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role);
  if (!actor)
    return { ok: false, error: "That role does not exist on this engagement." };
  await measureTask(actor, taskId);
  revalidatePath(`/v2/e/${engagement}/jobs`);
  return { ok: true };
}
