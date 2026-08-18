// What has already happened, and who decided it.
//
// The queue is what is still yours; this is the record. Deliberately not a list of green ticks:
// each row says who closed it, how its criteria came out, and how many of those a PERSON confirmed
// rather than a check — because "5 of 5, 2 confirmed by Matt" is a different fact from "5 of 5",
// and the second one is the kind of summary this whole product exists to stop producing.

import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveActor, rolesOnEngagement } from "@/app/lib/data/actor";
import { history } from "@/app/lib/data/history";
import { Tag, SectionLabel } from "../../../_ui/primitives";

export const dynamic = "force-dynamic";

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function took(from: string | null, to: string | null) {
  if (!from || !to) return null;
  const mins = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
}

export default async function HistoryPage(props: PageProps<"/v2/e/[engagement]/history">) {
  const { engagement } = await props.params;
  const search = await props.searchParams;
  const role = Array.isArray(search.role) ? search.role[0] : search.role;

  const roles = await rolesOnEngagement(engagement);
  const roleCode = role ?? roles.find((r) => r.holder)?.code;
  if (!roleCode) notFound();

  const actor = await resolveActor(engagement, roleCode);
  if (!actor) notFound();

  const jobs = await history(actor);

  return (
    <div className="page">
      <h2>What has happened</h2>
      <p className="jobs-blurb">
        {jobs.length === 0
          ? "Nothing has closed yet. Finished work lands here and stays."
          : `${jobs.length} job${jobs.length === 1 ? "" : "s"} closed, newest first. Nothing is removed.`}
      </p>

      <div className="history">
        {jobs.map((j) => (
          <article key={j.id} className="hist">
            <div className="hist-head">
              <Link href={`/v2/e/${engagement}/jobs/${j.id}?role=${roleCode}`} className="hist-title">
                {j.title}
              </Link>
              {j.workflowCode && <span className="hist-workflow">{j.workflowCode}</span>}
              {j.state === "abandoned" && <Tag tone="outline">abandoned</Tag>}
              <span className="hist-when">{when(j.closedAt)}</span>
            </div>

            <div className="hist-facts">
              {/* Who, not just when. An approval with no name answers nothing later. */}
              <span>closed by <strong>{j.closedBy ?? "—"}</strong></span>
              {took(j.startedAt, j.closedAt) && <span>{took(j.startedAt, j.closedAt)} open</span>}
              <span>{j.turns} message{j.turns === 1 ? "" : "s"}</span>
              {j.criteria.total > 0 && (
                <span>
                  {j.criteria.met} of {j.criteria.total} criteria met
                  {/* The split matters: a criterion a person attested is a different kind of
                      evidence from one a script computed, and the record should say which. */}
                  {j.criteria.byHuman > 0 && ` · ${j.criteria.byHuman} confirmed by a person`}
                </span>
              )}
            </div>

            {j.produced && (
              <div className="hist-produced">
                <SectionLabel>produced</SectionLabel>
                <code>{j.produced.path}</code> <Tag tone="accent-2">v{j.produced.version}</Tag>
                {j.produced.url && (
                  <a href={j.produced.url} target="_blank" rel="noreferrer" className="hist-link">
                    open in the doc store →
                  </a>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
