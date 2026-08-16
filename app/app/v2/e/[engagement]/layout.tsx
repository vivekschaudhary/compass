// The engagement shell — top bar, the three destinations, and "Working as".
//
// Top bar rather than a sidebar because that is what Organic ships, and because the three-pane
// job view and the permissions table both want the full width. The engagement is in the path so
// every screen is shareable; the role is a query parameter because it is a lens over the
// engagement rather than a place, and it is the seam real identity replaces.

import Link from "next/link";
import { notFound } from "next/navigation";
import { engagementSummary } from "@/app/lib/data/engagements";
import { rolesOnEngagement } from "@/app/lib/data/actor";
import { RoleSwitcher } from "./_RoleSwitcher";
import { TopNav } from "./_TopNav";

export const dynamic = "force-dynamic";

// `LayoutProps<'/route'>` is a global helper Next generates from the route tree — no import, and
// it is what makes the param name a compile error if the folder is ever renamed.
export default async function EngagementLayout(props: LayoutProps<"/v2/e/[engagement]">) {
  const { engagement } = await props.params;
  const summary = await engagementSummary(engagement);
  if (!summary) notFound();

  const roles = await rolesOnEngagement(engagement);
  const staffed = roles.filter((r) => r.holder);

  return (
    <>
      <header className="topbar">
        <div className="topbar-row">
          <span className="brand">Compass</span>
          <span className="tag tag-neutral engagement-tag">
            {summary.name}{summary.sprint ? ` · ${summary.sprint}` : ""}
          </span>
          <Link
            href={`/v2/e/${engagement}/setup`}
            className="btn btn-secondary btn-icon"
            title="Engagement setup" aria-label="Engagement setup"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </Link>

          <TopNav engagement={engagement} />
        </div>

        <div className="topbar-row topbar-row-secondary">
          <span className="working-as-label">Working as</span>
          <RoleSwitcher engagement={engagement} roles={staffed} />
        </div>
      </header>

      <main>{props.children}</main>
    </>
  );
}
