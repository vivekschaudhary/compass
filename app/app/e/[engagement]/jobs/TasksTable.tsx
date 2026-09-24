// Individually assigned work, flat — no grouping, no accordion. A row that nests a workflow is
// never in this list at all; it's a `WorkflowsTable` entry instead (see `workflows-view.ts`), not
// duplicated here as well as there.
//
// Same row cells `GroupCard` used to render, minus the expander and the children it used to expand
// into — a nesting row's own children used to render HERE, inline; now every one of them is its own
// flat entry in the Workflows table instead.

import type { TaskCard } from "@/app/lib/data/tasks";
import type { StoredStatus } from "@/app/lib/data/gates";
import { controlFor } from "./row-control";
import { GateDot, readyAllMet } from "./Gate";

export function TasksTable({
  tasks,
  engagement,
  myRole,
  gates,
}: {
  tasks: TaskCard[];
  engagement: string;
  myRole: string;
  gates: Map<string, StoredStatus[]>;
}) {
  // INDIVIDUALLY ASSIGNED ONLY. `tasksFor` returns the whole engagement's tasks for an
  // `everyone`-scope role (delivery-manager, pmo-analyst) — that scope means "may see everything,"
  // not "everything is mine." Without this filter, a full-visibility role's Tasks table shows
  // every OTHER role's rows too, which is what the old page's `groupByParent`+`isMine` split used
  // to prevent. Never a nesting row here either — that's a Workflows table entry, not a personal
  // task, whatever kind of work it is otherwise.
  const rows = tasks.filter((t) => !t.nests && t.roleCode === myRole);
  if (!rows.length) return null;

  return (
    <div className="queue-table-scroll">
      <h3 className="phases-head">Your tasks</h3>
      <table className="queue-table">
        <colgroup>
          <col className="col-title" />
          <col className="col-reads" />
          <col className="col-gate" />
          <col className="col-gate" />
          <col className="col-action" />
        </colgroup>
        <thead>
          <tr>
            <th>Task</th>
            <th>Reads</th>
            <th className="center">Ready</th>
            <th className="center">Done</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const statuses = gates.get(t.id) ?? [];
            const href = `/e/${engagement}/jobs/${t.id}?role=${t.roleCode}`;
            return (
              <tr key={t.id} className="row">
                <td className="cell-title">
                  <div className="title-cell">
                    <a href={href} className="title">{t.title}</a>
                    {t.ticketKey && <span className="ticket">{t.ticketKey}</span>}
                    {t.origin === "adhoc" && <span className="chip">ad-hoc</span>}
                  </div>
                  <div className="subtitle">{t.subtitle}</div>
                </td>
                <td className="cell-reads">
                  {t.reads.slice(0, 2).map((r) => (
                    <span key={r} className="chip">{r}</span>
                  ))}
                  {t.reads.length > 2 && <span className="chip">+{t.reads.length - 2}</span>}
                </td>
                <td className="cell-gate" data-label="Ready">
                  <GateDot statuses={statuses} kind="ready" />
                </td>
                <td className="cell-gate" data-label="Done">
                  <GateDot statuses={statuses} kind="done" />
                </td>
                <td className="cell-action">
                  {controlFor(t, { engagement, role: myRole, href, statuses, readyMet: readyAllMet(statuses) })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
