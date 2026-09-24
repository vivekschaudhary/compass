// Clear ONE nesting row's opened work, so it can be started again — `/api/cleanup` for a single
// row instead of the whole engagement.
//
// Same reasoning as `reset.ts`, narrowed: a nesting row (`Timeline & Milestones`) opens a CHILD
// run every time it starts, and that run is what needs clearing to try again — its tasks, the
// documents THOSE tasks filed, and the events they wrote. The nesting row itself is not deleted,
// it is RESET — back to `idle`, exactly as if it had never been opened, so the same "Open the X
// run" control starts it fresh.
//
// Pure planning, same split as `planReset`/`applyPlan`: the part that can be wrong is which rows
// belong to this scope and in what order they go, and that is worth testing without a database.

import type { Refusal } from "../envelope";

export type WorkflowResetSnapshot = {
  engagementId: string;
  nestingTaskId: string;
  /** Null means this task does not nest a workflow at all — nothing here applies to it. */
  nestsWorkflowCode: string | null;
  /** Every `workflow_run` ever opened with `parent_task_id = nestingTaskId`, open or closed. */
  runs: { id: string }[];
  /** Every `work_task` under those runs. */
  tasks: { id: string }[];
  /** Documents any of those tasks filed, via `document_version.created_by_task_id`. */
  documents: { id: string; path: string; externalUrl: string | null }[];
  /** Events whose subject is one of those runs or tasks. */
  events: { id: string }[];
};

export type WorkflowDeleteStep = {
  table: string;
  ids: string[];
  cascades: string[];
  why: string;
};

/** The nesting row's own row does not get deleted — it goes back to how `open_nested_run` found it. */
export type WorkflowResetStep = {
  table: "work_task";
  id: string;
  fields: Record<string, unknown>;
  why: string;
};

export type WorkflowResetPlan = {
  engagementId: string;
  nestingTaskId: string;
  nestsWorkflowCode: string;
  deletes: WorkflowDeleteStep[];
  resets: WorkflowResetStep[];
  publishedElsewhere: number;
};

export type WorkflowResetResult =
  | { ok: true; plan: WorkflowResetPlan }
  | { ok: false; refusals: Refusal[] };

/** What `open_nested_run` clears the row to before it opens anything — the state a fresh row starts in. */
export const IDLE_FIELDS = {
  state: "idle",
  started_at: null,
  started_by: null,
  executor: null,
  closed_at: null,
  closed_by: null,
  run_attempts: 0,
  next_attempt_at: null,
} as const;

export function planWorkflowReset(snap: WorkflowResetSnapshot): WorkflowResetResult {
  if (!snap.engagementId) {
    return { ok: false, refusals: [{ message: "No engagement named." }] };
  }
  if (!snap.nestingTaskId) {
    return { ok: false, refusals: [{
      message: "No task named.",
      fix: "Pass the id of the row that nests the workflow — e.g. \"Timeline & Milestones\", not the workflow's own steps.",
    }] };
  }
  if (!snap.nestsWorkflowCode) {
    return { ok: false, refusals: [{
      message: `Task '${snap.nestingTaskId}' does not nest a workflow.`,
      fix: "This reset only applies to a row whose step nests a workflow — a plain agent row has no child run to clear.",
    }] };
  }

  const runIds = snap.runs.map((r) => r.id);
  const taskIds = snap.tasks.map((t) => t.id);

  return { ok: true, plan: {
    engagementId: snap.engagementId,
    nestingTaskId: snap.nestingTaskId,
    nestsWorkflowCode: snap.nestsWorkflowCode,
    deletes: [
      {
        table: "work_task",
        ids: taskIds,
        cascades: ["task_input", "measurement", "turn", "question", "backlog_item"],
        why: `the ${snap.nestsWorkflowCode} run's own rows, their gate measurements and agent turns`,
      },
      {
        table: "workflow_run",
        ids: runIds,
        cascades: [],
        why: `every ${snap.nestsWorkflowCode} run this row opened, open or already closed`,
      },
      {
        // Same ordering note as `reset.ts`: `document.current_version_id` has no `on delete` rule,
        // so the caller nulls it before this rather than depending on delete order.
        table: "document",
        ids: snap.documents.map((d) => d.id),
        cascades: ["document_version", "document_section", "citation"],
        why: "the deliverables those rows filed, and every version, section and citation under them",
      },
      {
        table: "event",
        ids: snap.events.map((e) => e.id),
        cascades: [],
        why: "the audit log entries this run and its rows wrote",
      },
    ],
    resets: [
      {
        table: "work_task",
        id: snap.nestingTaskId,
        fields: IDLE_FIELDS,
        why: `back to idle, exactly as \`open_nested_run\` found it before it was ever opened`,
      },
    ],
    publishedElsewhere: snap.documents.filter((d) => d.externalUrl).length,
  } };
}

/** One line per step, matching `describeReset`'s shape so both reports read the same way. */
export function describeWorkflowReset(plan: WorkflowResetPlan): string[] {
  const out = plan.deletes.map((d) => {
    const cascade = d.cascades.length ? `  → cascades to ${d.cascades.join(", ")}` : "";
    return `  ${String(d.ids.length).padStart(5)}  ${d.table.padEnd(14)} ${d.why}${cascade}`;
  });
  for (const r of plan.resets) {
    out.push(`      1  ${r.table.padEnd(14)} ${r.id} → ${r.why}`);
  }
  return out;
}
