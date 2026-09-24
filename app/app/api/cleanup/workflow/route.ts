// Clear ONE nesting row's opened work, so it can be started again — `/api/cleanup` scoped to a
// single row instead of the whole engagement.
//
//   GET  /api/cleanup/workflow?engagementId=<id>&ref=<taskId-or-workflowCode>          report only
//   POST /api/cleanup/workflow?engagementId=<id>&ref=<taskId-or-workflowCode>&dry=1    report only
//   POST /api/cleanup/workflow?engagementId=<id>&ref=<taskId-or-workflowCode>          clear it
//
// `ref` is either the nesting row's own task id, or the workflow code it nests — "timeline" finds
// `Timeline & Milestones` the same way its own id would, as long as exactly one row on this
// engagement nests that code. Same shape as `/api/cleanup`, on purpose: GET reports, POST applies
// unless told to be dry, and the useful output of a destructive tool is the list of what it would
// destroy.
//
// WHAT IT DOES NOT TOUCH. Every OTHER row on the engagement is untouched — this is the one thing
// `/api/cleanup` cannot do, since it clears everything. Pages already published to Confluence and
// issues already created in Jira also stay where they are; `publishedElsewhere` says so.

import { resetWorkflow } from "@/app/lib/data/reset-workflow-apply";
import { describeWorkflowReset } from "@/app/lib/data/reset-workflow";
import { ok, refuse, fail } from "@/app/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function run(engagementId: string | null, ref: string | null, apply: boolean) {
  if (!engagementId) {
    return refuse("engagementId is required — this route clears one engagement's row at a time.", 400);
  }
  if (!ref) {
    return refuse(
      "ref is required — the nesting row's task id, or the workflow code it nests (e.g. \"timeline\").",
      400,
    );
  }

  try {
    const result = await resetWorkflow(engagementId, ref, { apply });
    if (!result.ok) return refuse(result.refusals);

    return ok({
      engagementId,
      nestingTaskId: result.plan.nestingTaskId,
      nestsWorkflowCode: result.plan.nestsWorkflowCode,
      cleared: result.cleared,
      report: describeWorkflowReset(result.plan),
      deletes: result.plan.deletes.map((d) => ({ table: d.table, rows: d.ids.length, cascades: d.cascades })),
      resets: result.plan.resets.map((r) => ({ table: r.table, id: r.id, fields: r.fields })),
      publishedElsewhere: result.plan.publishedElsewhere,
      // Fresh gate statuses for the nesting row itself, taken right after the reset — otherwise
      // the queue goes on showing whatever was last measured against the run this just deleted.
      remeasured: result.remeasured?.map((c) => ({
        id: c.id, kind: c.kind, satisfied: c.verdict.state === "satisfied",
      })),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The reset failed.");
  }
}

/** Reading must not write, so a GET is always a report however it is called. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  return run(url.searchParams.get("engagementId"), url.searchParams.get("ref"), false);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  return run(
    url.searchParams.get("engagementId"),
    url.searchParams.get("ref"),
    url.searchParams.get("dry") !== "1",
  );
}
