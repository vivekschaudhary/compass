// The engagement shell — a collapsible rail, and the work beside it.
//
// A rail rather than a top bar. The top bar spent its full width on three links and eleven role
// chips, which said everything at once and made the thing that mattered — who you are working as —
// the hardest to find. The rail holds navigation, collapses to a strip of icons when the work needs
// the room, and puts the role in a menu.
//
// The engagement is in the path so every screen is shareable; the role is a query parameter,
// because it is a lens over the engagement rather than a place, and it is the seam real identity
// replaces.

import { notFound } from "next/navigation";
import { engagementSummary } from "@/app/lib/data/engagements";
import { rolesOnEngagement } from "@/app/lib/data/actor";
import { Sidebar } from "./Sidebar";

export const dynamic = "force-dynamic";

export default async function EngagementLayout(props: LayoutProps<"/v2/e/[engagement]">) {
  const { engagement } = await props.params;
  const summary = await engagementSummary(engagement);
  if (!summary) notFound();

  const roles = await rolesOnEngagement(engagement);
  const staffed = roles.filter((r) => r.holder);

  // The layout cannot read the query string — that is the page's job — so it hands the rail every
  // role and lets the client mark the active one from the URL it can see.
  return (
    <div className="shell">
      <Sidebar
        engagement={engagement}
        engagementName={summary.name}
        sprint={summary.sprint}
        roles={roles}
        fallbackRole={staffed[0]?.code ?? roles[0]?.code ?? null}
      />
      <main>{props.children}</main>
    </div>
  );
}
