// The user's own closed work, on the screen they already look at.
//
// A closed task leaves the queue, which is right — but it also left the one place a drafter looks.
// A reviewer's comment arrives AFTER the drafting task closed, so the person who has to answer it
// had nowhere to go: the task they need was hidden by being finished. This lists them, newest
// first, and says on the row when comments are still open on what the task filed.
//
// Which rows (own role only, newest first, capped) is `history-rows.ts`.

import Link from "next/link";
import { Tag } from "../../../_ui/primitives";
import type { DoneJob } from "@/app/lib/data/history";
import { ownHistory, SHOWN } from "./history-rows";

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function HistoryTable({ jobs, engagement, myRole }: {
  jobs: DoneJob[]; engagement: string; myRole: string;
}) {
  const { rows, total } = ownHistory(jobs, myRole);
  if (!total) return null;

  return (
    <div className="queue-table-scroll jobs-table-card">
      <h3 className="phases-head">History</h3>
      <table className="queue-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Produced</th>
            <th>Closed</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.id} className="row">
              <td className="cell-title">
                <div className="title-cell">
                  <Link href={`/e/${engagement}/jobs/${j.id}?role=${myRole}`} className="hist-title">
                    {j.title}
                  </Link>
                  {j.state === "abandoned" && <Tag tone="outline">abandoned</Tag>}
                </div>
              </td>
              <td>
                {j.produced
                  ? <><code>{j.produced.path}</code> <Tag tone="accent-2">v{j.produced.version}</Tag></>
                  : <span className="text-muted">—</span>}
              </td>
              <td>
                {when(j.closedAt)}
                {j.closedBy && <span className="text-muted"> · {j.closedBy}</span>}
              </td>
              <td>
                {/* Null means the count could not be read: say nothing rather than imply none. */}
                {j.openComments !== null && j.openComments > 0 && (
                  <Link href={`/e/${engagement}/jobs/${j.id}?role=${myRole}`}>
                    <Tag tone="accent">
                      {j.openComments} open comment{j.openComments === 1 ? "" : "s"}
                    </Tag>
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > SHOWN && (
        <p className="text-muted">
          Showing {SHOWN} of {total}. <Link href={`/e/${engagement}/history?role=${myRole}`}>See all in History →</Link>
        </p>
      )}
    </div>
  );
}
