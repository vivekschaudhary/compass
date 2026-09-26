// The plan — every phase, its workflows, and Build's cycles, in one tree.
//
// The one page in this app whose data is NOT scoped to the viewing role. Every other screen answers
// "what is mine"; a delivery manager or exec opening this one wants the whole engagement, so
// `planFor` reads it unfiltered and every role sees the identical tree. `resolveActor` still runs —
// the top nav needs an identity — but nothing about what is fetched depends on which role it names.

import { notFound } from "next/navigation";
import { resolveActor, rolesOnEngagement } from "@/app/lib/data/actor";
import { planFor } from "@/app/lib/data/plan-view";
import { PlanBoard } from "./PlanBoard";

export const dynamic = "force-dynamic";

export default async function PlanPage(
  props: PageProps<"/e/[engagement]/plan">,
) {
  const { engagement } = await props.params;
  const search = await props.searchParams;
  const role = Array.isArray(search.role) ? search.role[0] : search.role;
  const holderId = Array.isArray(search.holder) ? search.holder[0] : search.holder;

  const roles = await rolesOnEngagement(engagement);
  const staffed = roles.filter((r) => r.holder);
  const roleCode = role ?? staffed[0]?.code;
  if (!roleCode) notFound();

  const actor = await resolveActor(engagement, roleCode, holderId);
  if (!actor) notFound();

  const phases = await planFor(engagement);

  return (
    <div className="page page-wide">
      <h2>Plan &amp; sprint</h2>
      <p className="jobs-blurb">
        Every phase of this engagement, and where each workflow inside it stands — the same board
        for every role. Double-click a card for its detail.
      </p>

      {phases.length === 0 ? (
        <div className="jobs-empty">
          <p className="jobs-empty-title">Nothing to show yet</p>
          <p className="text-muted">No phase has opened on this engagement.</p>
        </div>
      ) : (
        <PlanBoard phases={phases} engagement={engagement} role={actor.roleCode} />
      )}
    </div>
  );
}
