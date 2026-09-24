"use server";

// Server actions for the jobs queue.
//
// EXPORTS ONLY ASYNC FUNCTIONS. A "use server" module's every export becomes a callable endpoint,
// so a stray constant or type export here is a public surface nobody meant to create —
// `[server-action-file-export-purity]`.

import { revalidatePath } from "next/cache";
import { resolveActor } from "@/app/lib/data/actor";
import { startTask } from "@/app/lib/data/tasks";
import { measureTask, closeNestingRowIfSatisfied } from "@/app/lib/data/gates";
import {
  initiatePhase,
  openNestedFanOut,
  nestedWorkflowOf,
  remirrorPhase,
} from "@/app/lib/data/phases";
import { mirrorIncomplete, type Mirrored } from "@/app/lib/data/tracker";
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
  bodies?: {
    written: number;
    expected: number;
    problems: string[];
    incomplete: boolean;
  };
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
 * Start a task. The common program — every row goes through this to move out of idle, whatever
 * kind of row it is.
 *
 * Measuring first is not a convenience — the database refuses to start a task whose Ready criteria
 * have no satisfied measurement, so this is what makes the click possible at all. It also means the
 * refusal, when it comes, is based on a check taken seconds ago rather than whenever someone last
 * looked.
 *
 * Knows nothing about nesting. A row that nests a workflow still starts through here — see
 * `startWorkflowAction`, which calls this first and then does the nesting-specific work — but this
 * function's own job ends at "the row is running."
 */
export async function startTaskAction(
  engagement: string,
  role: string,
  taskId: string,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role);
  if (!actor)
    return { ok: false, error: "That role does not exist on this engagement." };

  const result = await startTask(actor, taskId);
  revalidatePath(`/e/${engagement}/jobs`);
  if (!result.ok) return { ok: false, error: result.error };

  return { ok: true };
}

/**
 * Start a row that NESTS a workflow: start it, then open the child run.
 *
 * Calls `startTaskAction` rather than re-implementing it — the row still has to move out of idle
 * the same way any row does, this just has more to do afterwards. Only `StartWorkflowButton` and
 * the task page's `NestedRunPanel` call this; a plain agent row never needed a child run and
 * `startTaskAction` alone is right for it.
 */
export async function startWorkflowAction(
  engagement: string,
  role: string,
  taskId: string,
): Promise<{
  ok: boolean;
  error?: string;
  openedWorkflow?: string;
  openedRuns?: number;
  mirrored?: Mirrored;
  problems?: string[];
  /**
   * Set only when exactly one run opened AND its first task auto-started for this same actor
   * (see `openNested`'s role check). A fan-out opening several runs has no single "next" task to
   * send anyone to, so this stays unset and the click lands on the row's own page as before.
   */
  startedTaskId?: string;
}> {
  const started = await startTaskAction(engagement, role, taskId);
  if (!started.ok) return started;

  const actor = await resolveActor(engagement, role);
  if (!actor)
    return { ok: false, error: "That role does not exist on this engagement." };

  const nests = await nestedWorkflowOf(taskId);
  if (!nests) return { ok: true };

  const child = await openNestedFanOut(actor, taskId);
  revalidatePath(`/e/${engagement}/jobs`);
  if (!child.ok) return { ok: false, error: child.error };

  //await measureTask(actor, taskId);
  const problems = child.runs.flatMap((r) =>
    r.mirrored.problems.map((p) => (r.subject ? `${r.subject}: ${p}` : p)),
  );
  return {
    ok: true,
    openedWorkflow: nests,
    openedRuns: child.runs.length,
    mirrored: child.runs[0].mirrored,
    problems: problems.length ? problems : undefined,
    startedTaskId:
      child.runs.length === 1 ? (child.runs[0].startedTaskId ?? undefined) : undefined,
  };
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
  /** Reporting bucket for a repeating phase (`sprint`) — see `initiatePhase`. */
  phaseTag?: string,
): Promise<{
  ok: boolean;
  error?: string;
  tasks?: number;
  board?: Board;
}> {
  const actor = await resolveActor(engagement, role);
  if (!actor)
    return { ok: false, error: "That role does not exist on this engagement." };

  const result = await initiatePhase(actor, workflowCode, phaseTag);
  revalidatePath(`/e/${engagement}/jobs`);
  if (!result.ok) return { ok: false, error: result.error };

  const m = result.mirrored;
  return {
    ok: true,
    tasks: result.tasks.length,
    board: m ? board(m) : undefined,
  };
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
  revalidatePath(`/e/${engagement}/jobs`);
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
  revalidatePath(`/e/${engagement}/jobs`);
  // The task page reads the same measurements and is now where the control lives. Revalidating only
  // the queue meant the page you pressed it on kept showing the verdict you had just replaced.
  revalidatePath(`/e/${engagement}/jobs/${taskId}`);
  return { ok: true };
}

/**
 * Finish a nesting row by hand, once its nested run has closed.
 *
 * The escape hatch, not the normal path — `remeasureRun` retries the close on its own whenever
 * something re-measures the row. But "whenever something re-measures it" is not "always": a Done
 * criterion can turn true because of a Confluence page someone published or a ticket someone moved,
 * and nothing in Compass observes either. Without this, such a row has no control anywhere in the
 * app that can close it: the queue card offers "Open the job", and the job page offers a list of
 * child rows, because `ApprovePanel` renders only on `hitl` with a draft. That is how `CT-151` sat
 * open for an hour with a fully green Done gate.
 *
 * Re-measures FIRST. Pressing it should decide on today's evidence, not on whatever verdict the
 * card happens to be showing.
 */
export async function closeNestedAction(
  engagement: string,
  role: string,
  taskId: string,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await resolveActor(engagement, role);
  if (!actor)
    return { ok: false, error: "That role does not exist on this engagement." };

  await measureTask(actor, taskId);
  const result = await closeNestingRowIfSatisfied(actor, taskId);

  revalidatePath(`/e/${engagement}/jobs`);
  revalidatePath(`/e/${engagement}/jobs/${taskId}`);
  // The refusal is the useful half. It names the criterion that is not met, which is the thing the
  // person has to go and fix.
  if (!result.closed) return { ok: false, error: result.why };
  return { ok: true };
}
