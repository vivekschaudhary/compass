// One document, full width.
//
// The content screen lists the tree and stops, and the job screen shows the deliverable beside a
// conversation. Neither gives a document its own address — so "read the product brief" meant
// finding the job that produced it, or opening Confluence. A document you cannot link to is one
// people will link to somewhere else.
//
// Read-only. Editing belongs on the job screen, where the row, its gate and the agent that drafted
// it are all in view; an edit made here would be a change to a deliverable with none of that
// context on screen.

import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveActor, rolesOnEngagement } from "@/app/lib/data/actor";
import { draftOf } from "@/app/lib/data/job";
import { Markdown } from "../../../../_ui/Markdown";
import { Tag } from "../../../../_ui/primitives";

export const dynamic = "force-dynamic";

export default async function DocumentPage(
  props: PageProps<"/e/[engagement]/content/[...path]">,
) {
  const { engagement, path } = await props.params;
  const search = await props.searchParams;
  const role = Array.isArray(search.role) ? search.role[0] : search.role;

  const roles = await rolesOnEngagement(engagement);
  const roleCode = role ?? roles.find((r) => r.holder)?.code;
  if (!roleCode) notFound();

  const actor = await resolveActor(engagement, roleCode);
  if (!actor) notFound();

  // A document path is several segments (`02-scope/sow`), so the route is a catch-all and the
  // segments are rejoined here. `draftOf` applies the engagement scope, as every read does.
  const docPath = (path as string[]).join("/");
  const doc = await draftOf(actor, docPath);
  if (!doc) notFound();

  return (
    <div className="page doc-page">
      <div className="job-head">
        <Link href={`/e/${engagement}/content?role=${roleCode}`} className="job-back">
          ← Shared content
        </Link>
        <div className="job-title-row">
          <h2>{docPath}</h2>
          <Tag tone={doc.status === "published" ? "accent-2" : "outline"}>
            {doc.status} v{doc.version}
          </Tag>
        </div>
      </div>

      {doc.authorKind === "human" && (
        <p className="draft-author text-muted">
          v{doc.version} was edited by {doc.authoredBy ?? "a person"}.
        </p>
      )}

      <article className="doc-article">
        {doc.sections.map((s) => (
          <section key={s.id} className="doc-section">
            <h3 className="doc-heading">{s.heading}</h3>
            <Markdown className="doc-body">{s.body}</Markdown>
            {s.edited ? (
              <div className="draft-cites draft-cites-stale">
                Rewritten by a person — the original sources no longer describe this text.
              </div>
            ) : (
              s.cites.length > 0 && (
                <div className="draft-cites">
                  from {s.cites.map((c) => `${c.path} v${c.version}`).join(", ")}
                </div>
              )
            )}
          </section>
        ))}
      </article>
    </div>
  );
}
