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

/** The deletes, in the order they have to happen — tasks before the runs they belong to, and so on. */
function deleteSteps(
  code: string,
  runIds: string[],
  taskIds: string[],
  documents: { id: string }[],
  events: { id: string }[],
): WorkflowDeleteStep[] {
  return [
    {
      table: "work_task",
      ids: taskIds,
      cascades: ["task_input", "measurement", "turn", "question", "backlog_item"],
      why: `the ${code} run's own rows, their gate measurements and agent turns`,
    },
    {
      table: "workflow_run",
      ids: runIds,
      cascades: [],
      why: `every ${code} run this reset names, open or already closed`,
    },
    {
      // Same ordering note as `reset.ts`: `document.current_version_id` has no `on delete` rule,
      // so the caller nulls it before this rather than depending on delete order.
      table: "document",
      ids: documents.map((d) => d.id),
      cascades: ["document_version", "document_section", "citation"],
      why: "the deliverables those rows filed, and every version, section and citation under them",
    },
    {
      table: "event",
      ids: events.map((e) => e.id),
      cascades: [],
      why: "the audit log entries this run and its rows wrote",
    },
  ];
}

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
    deletes: deleteSteps(snap.nestsWorkflowCode, runIds, taskIds, snap.documents, snap.events),
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

// ── a top-level run ──────────────────────────────────────────────────────────────────────────────
//
// Not every run is opened by a nesting row. A per-subject run — `tech-design` for one epic,
// `refine-stories` for one epic — is started from the workflow list with a SUBJECT and no parent
// task, so there is no row to point `planWorkflowReset` at, and `drop-run.mts` refuses it as soon as
// anyone has talked to the agent. This is the same reset aimed at the run itself: its tasks (and so
// their turns, questions and gate measurements), the documents they filed, the events they wrote,
// then the run. There is no row to put back to idle — the run was the thing that existed.
//
// It deletes the conversation, on purpose: that is what "start it again from scratch" means, and
// this is a dev-mode tool. The report says so before anything is applied.

export type RunResetSnapshot = {
  engagementId: string;
  workflowCode: string;
  runs: { id: string; state: string; subjectRef: string | null; subjectKey: string | null }[];
  tasks: { id: string; ticketKey: string | null }[];
  documents: { id: string; path: string; externalUrl: string | null }[];
  events: { id: string }[];
};

export type RunResetPlan = {
  engagementId: string;
  workflowCode: string;
  runIds: string[];
  deletes: WorkflowDeleteStep[];
  resets: WorkflowResetStep[];
  publishedElsewhere: number;
  /** Issues already created in the tracker for these rows. They stay — deleting them is a person's call. */
  ticketsLeftInTracker: string[];
  documentPaths: string[];
};

export type RunResetResult =
  | { ok: true; plan: RunResetPlan }
  | { ok: false; refusals: Refusal[] };

export function planRunReset(snap: RunResetSnapshot): RunResetResult {
  if (!snap.engagementId) return { ok: false, refusals: [{ message: "No engagement named." }] };
  if (!snap.runs.length) {
    return { ok: false, refusals: [{
      message: `No ${snap.workflowCode || "such"} run to reset.`,
      fix: "Pass a run id, or `<workflow code>:<epic key>` such as `tech-design:CT-288`.",
    }] };
  }
  // A run with no subject is a PHASE (sprint-0, setup…): hundreds of rows, the whole engagement's
  // spine. This reset is for the one-epic-at-a-time runs, and silently widening it to a phase is how a
  // reset meant for one design deletes a month of work.
  const phase = snap.runs.filter((r) => !r.subjectRef && !r.subjectKey);
  if (phase.length) {
    return { ok: false, refusals: [{
      message: `Run ${phase[0].id} has no subject — it is a phase run, not a per-epic one.`,
      fix: "Reset a phase through its nesting row (`/api/cleanup/workflow`), or the whole engagement (`/api/cleanup`).",
    }] };
  }

  const runIds = snap.runs.map((r) => r.id);
  return { ok: true, plan: {
    engagementId: snap.engagementId,
    workflowCode: snap.workflowCode,
    runIds,
    deletes: deleteSteps(snap.workflowCode, runIds, snap.tasks.map((t) => t.id), snap.documents, snap.events),
    resets: [],
    publishedElsewhere: snap.documents.filter((d) => d.externalUrl).length,
    ticketsLeftInTracker: snap.tasks.map((t) => t.ticketKey).filter((k): k is string => !!k),
    documentPaths: snap.documents.map((d) => d.path),
  } };
}

/** One line per step, matching `describeReset`'s shape so both reports read the same way. */
export function describeWorkflowReset(plan: { deletes: WorkflowDeleteStep[]; resets: WorkflowResetStep[] }): string[] {
  const out = plan.deletes.map((d) => {
    const cascade = d.cascades.length ? `  → cascades to ${d.cascades.join(", ")}` : "";
    return `  ${String(d.ids.length).padStart(5)}  ${d.table.padEnd(14)} ${d.why}${cascade}`;
  });
  for (const r of plan.resets) {
    out.push(`      1  ${r.table.padEnd(14)} ${r.id} → ${r.why}`);
  }
  return out;
}
