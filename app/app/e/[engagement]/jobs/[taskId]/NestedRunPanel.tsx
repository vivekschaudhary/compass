"use client";

// A row that is satisfied by a WORKFLOW, not by an agent.
//
// This replaces the Run button on such a row, because there is no agent to run: the work happens in
// the child run's own steps, each with its own role, its own gates and its own conversation. Before
// this, the job page offered "Run the agent" on every open row, so the only act available here was
// the one guaranteed to be refused — a 500 carrying "this row is satisfied by the timeline
// workflow, not by an agent", shown in a line styled like a success.
//
// Two screens, because "you have not started it" and "you started it and these rows opened" are
// different situations and were previously both rendered as nothing:
//
//   * not opened → one control that opens the child run
//   * opened     → the rows themselves, each a link, so the work is visible where it actually is
//
// The second is the answer to "I started it and nothing happened". Something did happen — rows
// opened, owned by other roles, on a queue this person may not be looking at.

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button, Tag } from "../../../../_ui/primitives";
import { startWorkflowAction } from "../actions";
import { CloseNestedButton } from "../CloseNestedButton";

type ChildRun = {
  runId: string;
  state: string;
  subject: string | null;
  tasks: {
    id: string;
    title: string;
    roleCode: string;
    state: string;
    ticketKey: string | null;
  }[];
};

const STATE_LABEL: Record<string, string> = {
  idle: "not started",
  running: "started",
  awaiting: "waiting on an answer",
  hitl: "awaiting approval",
  closed: "closed",
};

export function NestedRunPanel({
  engagement,
  role,
  taskId,
  nests,
  runs,
}: {
  engagement: string;
  role: string;
  taskId: string;
  /** The workflow code this row nests. */
  nests: string;
  runs: ChildRun[];
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every run this row opened has finished, so the row's own work is over — whether its gate agrees
  // is the button's question to ask, not this one's. Offering it only when something is actually
  // finished keeps it from reading as a way to skip the nested work.
  const allChildrenClosed =
    runs.length > 0 && runs.every((r) => r.state === "closed");

  async function open() {
    setOpening(true);
    setError(null);
    // The SAME action the queue card uses. Not a second opening path: `openNestedFanOut` stays the
    // only way a child run is born, so one row can never open a run the other surface would not.
    const r = await startWorkflowAction(engagement, role, taskId);
    if (!r.ok) {
      setError(r.error ?? "Could not open it.");
      setOpening(false);
      return;
    }
    // Same rule as the queue card's own button: a same-role auto-start goes straight to the task
    // that started, rather than refreshing this panel to show a link to it one click away.
    if (r.startedTaskId) {
      router.push(`/e/${engagement}/jobs/${r.startedTaskId}?role=${role}`);
      return;
    }
    router.refresh();
    setOpening(false);
  }

  return (
    <div className="nested-panel">
      <p className="nested-lede">
        This row is satisfied by the <strong>{nests}</strong> workflow, not by an agent. Its steps
        are where the work happens.
      </p>

      {runs.length === 0 ? (
        <div className="run-row">
          <Button variant="primary" disabled={opening} onClick={open}>
            {opening ? "Opening…" : `Open the ${nests} run`}
          </Button>
          {/* A refusal is worth showing in full, and showing as a refusal. The gate can still say
              no — opening goes through `startTask` first, exactly as the queue does. */}
          {error && <span className="nested-error">{error}</span>}
        </div>
      ) : (
        runs.map((run) => (
          <div key={run.runId} className="nested-run">
            <div className="nested-run-head">
              <span className="nested-run-title">
                {run.subject ? `${nests} · ${run.subject}` : `${nests} run`}
              </span>
              <Tag tone={run.state === "closed" ? "accent-2" : "outline"}>
                {run.state === "closed" ? "closed" : "open"}
              </Tag>
            </div>

            {run.tasks.length === 0 ? (
              // Never silently empty. A run holding no rows is a real failure state — the row would
              // sit open for ever with nothing able to close it — and saying "no rows yet" out loud
              // is how anyone finds out.
              <p className="nested-empty">
                This run has no rows. Nothing can close it — worth reporting.
              </p>
            ) : (
              <ul className="nested-tasks">
                {run.tasks.map((t) => (
                  <li key={t.id} className="nested-task">
                    <Link
                      href={`/e/${engagement}/jobs/${t.id}?role=${t.roleCode}`}
                      className="nested-task-title"
                    >
                      {t.title}
                    </Link>
                    <span className="nested-task-meta">
                      {t.roleCode} · {STATE_LABEL[t.state] ?? t.state}
                      {t.ticketKey ? ` · ${t.ticketKey}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}

      {allChildrenClosed && (
        <div className="nested-finish">
          <p className="nested-lede">
            The <strong>{nests}</strong> run has closed. This row closes when its own Done
            criteria are met — normally on its own, and here if it did not.
          </p>
          <CloseNestedButton engagement={engagement} role={role} taskId={taskId} />
        </div>
      )}
    </div>
  );
}
