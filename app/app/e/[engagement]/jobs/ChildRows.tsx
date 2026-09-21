// The rows a nesting row opened, inside its card.
//
// A row that nests a workflow does no work itself: it opens a run, and that run's steps are where
// the work happens. Those steps used to be loose top-level cards with nothing saying where they
// came from — so the nesting row's own card was the only thing on screen that could not be acted
// on, while looking exactly like one that could. With four of the seed's ten nesting rows sharing a
// title with their first step, that meant two cards with one name and the work apparently stuck.
//
// Same shape as the list in `jobs/[taskId]/NestedRunPanel.tsx`, deliberately: the queue and the job
// page describe a run the same way, so moving between them does not mean re-learning it.

import type { TaskCard } from "@/app/lib/data/tasks";
import type { StoredStatus } from "@/app/lib/data/gates";
import { StartButton } from "./StartButton";
import { doneAllMet, tallyOf } from "./Gate";

const STATE_LABEL: Record<string, string> = {
  idle: "not started",
  running: "started",
  awaiting: "waiting on an answer",
  hitl: "awaiting approval",
  closed: "closed",
};

export function ChildRows({
  engagement,
  actorRole,
  rows,
  gates,
  holderOf,
}: {
  engagement: string;
  /** Whose queue this is. A row of theirs gets a control; anyone else's gets a way in. */
  actorRole: string;
  rows: TaskCard[];
  gates: Map<string, StoredStatus[]>;
  /** role code → the person holding it, for "Open as Maria". */
  holderOf: (roleCode: string) => string;
}) {
  if (!rows.length) return null;

  // By run, not one flat list. A fan-out opens one run per epic against a single row, and "eight
  // rows" is a different fact from "four epics of two rows".
  const runs: { key: string; label: string; state: string | null; rows: TaskCard[] }[] = [];
  for (const r of rows) {
    const key = r.runId ?? "none";
    const found = runs.find((x) => x.key === key);
    if (found) {
      found.rows.push(r);
      continue;
    }
    const what = r.workflowCode ?? "nested";
    runs.push({
      key,
      label: r.runSubject ? `${what} · ${r.runSubject}` : `${what} run`,
      state: r.runState,
      rows: [r],
    });
  }

  return (
    <div className="job-card-children">
      {runs.map((run) => (
        <div key={run.key} className="child-run">
          <p className="child-run-head">
            {run.label}
            <span className="child-run-state">
              {run.state === "closed" ? "closed" : "open"}
            </span>
          </p>
          <ul className="child-list">
            {run.rows.map((t) => {
              const statuses = gates.get(t.id) ?? [];
              const href = `/e/${engagement}/jobs/${t.id}?role=${t.roleCode}`;
              return (
                <li key={t.id} className="child-row">
                  <div className="child-row-main">
                    <a href={href} className="child-row-title">
                      {t.title}
                    </a>
                    <p className="child-row-meta">
                      {holderOf(t.roleCode)} · {STATE_LABEL[t.state] ?? t.state}
                      {t.ticketKey ? ` · ${t.ticketKey}` : ""}
                      {[tallyOf(statuses, "ready"), tallyOf(statuses, "done")]
                        .filter(Boolean)
                        .map((s) => ` · ${s}`)
                        .join("")}
                    </p>
                  </div>
                  {/* A row of this person's is theirs to do, and it gets the same control it would
                      have had as a card of its own. Anyone else's gets the way in, exactly as the
                      "Across the engagement" cards do — the point is that the work is visible and
                      attributed, not that everyone can press everything. */}
                  {t.roleCode === actorRole ? (
                    <StartButton
                      taskId={t.id}
                      engagement={engagement}
                      role={actorRole}
                      state={t.state}
                      executor={t.executor}
                      href={href}
                      openQuestions={t.openQuestions}
                      machine={t.stepKind === "machine"}
                      nests={t.nests}
                      doneMet={doneAllMet(statuses)}
                    />
                  ) : (
                    <a className="btn btn-secondary" href={href}>
                      Open as {holderOf(t.roleCode)}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
