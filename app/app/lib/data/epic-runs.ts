// A workflow that opens itself for every epic the moment the epic reaches the board.
//
// `refine-stories` is about ONE epic. Starting it was a person's choice from a picker, which meant an
// epic nobody picked simply had nothing to say about its stories — no task, no ticket, no queue
// row. Declaring `trigger: epic-filed` on the workflow turns that around: filing an epic also opens
// its run, idle, so every epic arrives on the board with its work already named. A person still
// STARTS that work; nothing here drafts anything.
//
// Failure never costs the epic. The epic is on the board and the run is a convenience on top of it,
// so a run that would not open is REPORTED and left for the picker, which opens the same run and is
// idempotent. Reporting is not optional: an epic that quietly has no tasks reads as one nobody
// planned to refine.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./actor";
import { orgIdFor } from "./events";
import { initiatePhase } from "./phases";

/** How many runs open at once. Each is a handful of queries and two Jira calls; unbounded would be a burst. */
const CONCURRENCY = 4;

/** The enabled workflows that declare they are opened by an epic being filed. */
export async function epicTriggeredWorkflows(engagementId: string): Promise<string[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const orgId = await orgIdFor(engagementId);
  if (!orgId) return [];
  const { data } = await sb.from("workflow")
    .select("code").eq("org_id", orgId).eq("enabled", true).eq("trigger", "epic-filed");
  return (data ?? []).map((w) => w.code as string);
}

export type OpenedForEpics = {
  opened: { epic: string; workflow: string; runId: string }[];
  problems: string[];
};

/**
 * Open every epic-triggered workflow for each of these epics.
 *
 * Idempotent through `initiatePhase`: an epic that already has an open run gets that run back, so
 * calling this twice for the same epics opens nothing new.
 */
export async function openRunsForEpics(
  actor: Actor, epics: { ref: string }[],
): Promise<OpenedForEpics> {
  const out: OpenedForEpics = { opened: [], problems: [] };
  if (!epics.length) return out;

  const workflows = await epicTriggeredWorkflows(actor.engagementId);
  if (!workflows.length) return out;

  const jobs = workflows.flatMap((workflow) => epics.map((e) => ({ workflow, epic: e.ref })));
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const r = await initiatePhase(actor, job.workflow, undefined, job.epic);
        if (r.ok) out.opened.push({ ...job, runId: r.runId });
        else out.problems.push(`${job.epic}: ${job.workflow} did not open — ${r.error.split("\n")[0]}`);
      } catch (e) {
        out.problems.push(`${job.epic}: ${job.workflow} did not open — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  return out;
}
