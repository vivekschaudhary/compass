// Shared content — one body of content, and who may touch it.
//
// Not a place you author. Content is the input a job reads, surfaced as a pointer; this screen
// answers the two questions the pointers raise — what is there, and who owns it.

import { notFound } from "next/navigation";
import { resolveActor, rolesOnEngagement } from "@/app/lib/data/actor";
import { documentTree, permissions, contentFlow, citationCount } from "@/app/lib/data/documents";
import { Table, Tag, SectionLabel } from "../../../_ui/primitives";

export const dynamic = "force-dynamic";

export default async function ContentPage(props: PageProps<"/v2/e/[engagement]/content">) {
  const { engagement } = await props.params;
  const search = await props.searchParams;
  const role = Array.isArray(search.role) ? search.role[0] : search.role;

  const roles = await rolesOnEngagement(engagement);
  const roleCode = role ?? roles.find((r) => r.holder)?.code;
  if (!roleCode) notFound();

  const actor = await resolveActor(engagement, roleCode);
  if (!actor) notFound();

  const [tree, perms, flow, cited] = await Promise.all([
    documentTree(actor), permissions(actor), contentFlow(), citationCount(actor),
  ]);

  const docs = tree.filter((n) => n.kind !== "folder");
  const published = docs.filter((n) => n.status === "published").length;

  return (
    <div className="page">
      <h2>One body of content</h2>
      <p className="jobs-blurb">
        Every role&apos;s journey differs; the files do not. {docs.length} documents,
        {" "}{published} published, {cited} claim{cited === 1 ? "" : "s"} traced back to a source.
      </p>

      <section className="content-block">
        <SectionLabel>The tree</SectionLabel>
        <div className="doc-tree">
          {tree.map((n) => (
            <div key={n.id} className="doc-row" style={{ paddingLeft: `${n.depth * 22}px` }}>
              <span className={n.kind === "folder" ? "doc-name doc-name-folder" : "doc-name"}>{n.title}</span>
              <span className="doc-path">{n.path}</span>
              {n.status === "published" && <Tag tone="accent-2">v{n.version}</Tag>}
              {n.status === "draft" && <Tag tone="outline">draft v{n.version}</Tag>}
              {n.kind !== "folder" && !n.status && <span className="doc-empty">not drafted</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="content-block">
        <SectionLabel>How content flows</SectionLabel>
        {/* Deliberately not called lineage. Lineage is what claims were actually traced to, and
            that is the citation graph — which is empty until an agent drafts something. This is
            what the process INTENDS, which is a different and honest thing to show. */}
        <p className="content-note text-muted">
          What the workflows declare — read here, produced there. Once agents start drafting, the
          citations record what each claim was actually traced to, and the two can be compared.
        </p>
        {flow.length === 0 ? (
          <p className="content-note text-muted">No published workflow declares a document yet.</p>
        ) : (
          <div className="flow-list">
            {flow.map((e, i) => (
              <div key={i} className="flow-edge">
                <code>{e.from}</code>
                <span className="flow-via">→ {e.via} →</span>
                <code>{e.to}</code>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="content-block">
        <SectionLabel>Who may edit and read</SectionLabel>
        <p className="content-note text-muted">
          Derived from the workflows, not stored — a role that produces a document edits it, a role
          whose step reads it reads it. Change a workflow and this follows.
        </p>
        <div className="dl-scroll">
          <Table head={["File", "Owns it", "May edit", "May read"]}>
            {perms.map((p) => (
              <tr key={p.path}>
                <td>
                  {p.title}
                  <span className="doc-sub">{p.path}</span>
                </td>
                <td>{p.owns ?? "—"}</td>
                <td>{p.edits.length ? p.edits.join(", ") : "—"}</td>
                <td>{p.reads.length ? p.reads.join(", ") : "—"}</td>
              </tr>
            ))}
          </Table>
        </div>
      </section>
    </div>
  );
}
