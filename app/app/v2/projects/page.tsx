// Every engagement in the org.
//
// Counts, not status words: "3 open · 2 documents" is checkable, where "on track" is a claim
// nobody signed. The same discipline the gates use, at portfolio altitude.

import Link from "next/link";
import { engagementsOverview } from "@/app/lib/data/engagements";
import { Table, Tag } from "../_ui/primitives";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const rows = await engagementsOverview();

  return (
    <div className="page">
      <div className="projects-head">
        <div>
          <h2>Projects</h2>
          <p className="jobs-blurb">
            {rows.length} engagement{rows.length === 1 ? "" : "s"} in this organisation.
          </p>
        </div>
        <Link href="/v2/new" className="btn btn-primary">+ New</Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">Nothing yet. <Link href="/v2/new">Start one</Link>.</p>
      ) : (
        <div className="dl-scroll">
          <Table head={["Engagement", "Open work", "Documents", "Systems of record"]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/v2/e/${r.id}/jobs`} className="job-card-link">{r.name}</Link>
                  <span className="doc-sub">{r.client ?? "—"}{r.phase ? ` · ${r.phase}` : ""}</span>
                </td>
                <td>{r.openTasks === 0 ? <span className="text-muted">none</span> : `${r.openTasks} open`}</td>
                <td>{r.documents === 0 ? <span className="text-muted">none filed</span> : `${r.documents} filed`}</td>
                <td>
                  {/* Configured, which is not the same as reachable — the gate is what asks the API.
                      Saying "wired" here would be the claim this app exists to stop making. */}
                  {r.docsProvider && <Tag tone="outline">{r.docsProvider}</Tag>}{" "}
                  {r.jiraProject && <Tag tone="outline">{r.jiraProject}</Tag>}
                  {!r.docsProvider && !r.jiraProject && <span className="text-muted">not configured</span>}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  );
}
