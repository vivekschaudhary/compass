// Jobs to do — the landing screen, and the first one reading real rows.
//
// A server component: the queue comes through lib/data, which applies the engagement filter and
// the role's scope from the Actor. The card cannot be rendered without those, because there is no
// other way to get the data.
//
// The copy changes per role, which is what makes the switcher land. Jen's PM agent "has read the
// strategy doc and drafted nothing yet"; Maria's stories "arrive tech-ready". Same screen, and it
// reframes.

import { notFound } from "next/navigation";
import { resolveActor, rolesOnEngagement } from "@/app/lib/data/actor";
import { tasksFor, startedCounts, queueNotices } from "@/app/lib/data/tasks";
import { storedStatusFor } from "@/app/lib/data/gates";
import { phasesFor } from "@/app/lib/data/phases";
import { PhaseStarter } from "./PhaseStarter";
import { JobCard } from "../../../_ui/primitives";
import { StartButton } from "./StartButton";
import { Gate } from "./Gate";

export const dynamic = "force-dynamic";

/** What a role's queue is FOR, said in one line. Falls back to something true but plain. */
const BLURB: Record<string, string> = {
  "delivery-manager":
    "Setting the engagement up so every other queue can fill.",
  pm: "Your PM agent has read the strategy doc, the SOW and this week's support themes. It has drafted nothing yet.",
  "product-owner":
    "Stories to shape and refine before they reach the build queue.",
  engineer: "Stories arrive here tech-ready; the agent implements, you review.",
  architect: "Technical designs to author against the code as it actually is.",
  designer: "Design specs and the library every screen is built from.",
  reviewer:
    "Diffs to review on a fresh context — you see the change and the spec, not the history.",
};

const GLYPH: Record<string, string> = {
  agent: "✎",
  hitl: "◇",
  approval: "◇",
  code: "▶",
};

export default async function JobsPage(
  props: PageProps<"/v2/e/[engagement]/jobs">,
) {
  const { engagement } = await props.params;
  const search = await props.searchParams;
  // A query parameter can legitimately arrive repeated; take the first rather than stringifying
  // an array into a role code that matches nothing.
  const role = Array.isArray(search.role) ? search.role[0] : search.role;

  const roles = await rolesOnEngagement(engagement);
  const staffed = roles.filter((r) => r.holder);
  const roleCode = role ?? staffed[0]?.code;
  if (!roleCode) notFound();

  const actor = await resolveActor(engagement, roleCode);
  if (!actor) notFound();

  const tasks = await tasksFor(actor);

  const phases = await phasesFor(actor);

  const mine = tasks.filter((t) => t.roleCode === actor.roleCode);
  const others = tasks.filter((t) => t.roleCode !== actor.roleCode);
  // Read-only: rendering shows what was last measured, it does not re-measure. A refresh that
  // silently re-checked would make stale evidence look fresh.
  const gates = await storedStatusFor(tasks.map((t) => t.id));
  const firstName = (actor.holder ?? actor.roleLabel).split(" ")[0];

  // A SECOND read, deliberately. Both sentences below are claims about absence, and the queue is
  // the one set that cannot support them: it drops closed work, so once the SOW was accepted every
  // row left in it had a null started_at and the screen announced that nothing had ever run.
  const started = await startedCounts(actor);
  const notice = queueNotices({
    mineQueued: mine.length,
    totalQueued: mine.length + others.length,
    startedMine: started.mine,
    startedVisible: started.visible,
  });

  return (
    <div className="page">
      <h2>{firstName}, here&apos;s your work</h2>
      <p className="jobs-blurb">
        {BLURB[actor.roleCode] ??
          `Work assigned to the ${actor.roleLabel.toLowerCase()} on this engagement.`}
      </p>

      {/* Only claim it if it is true — and check it against every task this role owns, not against
          the queue. `started_at` is a sound witness; the queue is not a population that can
          disprove it, because accepting the work is what removes the evidence. */}
      {notice.banner === "never-run" && (
        <p className="jobs-note">
          Nothing has run yet. Each job starts a conversation with an agent when
          — and only when — you click it.
        </p>
      )}

      {/* Above the queue, because on a new engagement it IS the queue. */}
      <PhaseStarter
        engagement={engagement}
        role={actor.roleCode}
        phases={phases}
      />

      {notice.empty === "all-done" ? (
        // An engagement that has finished its work presents exactly like one that has not begun —
        // no cards either way. Telling a delivery manager who just closed the SOW that work will
        // arrive once the kickoff backlog is shaped is the same defect as the banner, one sentence
        // further down: the queue was asked which of the two this is, and it cannot know.
        <div className="jobs-empty">
          <p className="jobs-empty-title">Everything here is done</p>
          <p className="text-muted">
            {`Nothing is open for ${actor.roleLabel} on this engagement.`}{" "}
            What has already run — what it produced, who accepted it and where
            it was published — is in{" "}
            <a href={`/v2/e/${engagement}/history`}>the history</a>. The next
            phase puts new work here.
          </p>
        </div>
      ) : notice.empty === "none-yet" ? (
        <div className="jobs-empty">
          <p className="jobs-empty-title">Nothing in your queue</p>
          <p className="text-muted">
            {`No work is assigned to ${actor.roleLabel} here yet.`}{" "}
            {/* On a fresh engagement this is not a bug, it is the sequence: nothing reaches
                anyone else's queue until the kickoff backlog is shaped and published. Saying so
                beats an empty box that reads like something is broken. */}
            Work arrives when an upstream job publishes — on a new engagement
            that means the kickoff backlog, which the Delivery Manager shapes
            first.
          </p>
        </div>
      ) : (
        <div className="jobs-list">
          {mine.map((t) => (
            <JobCard
              key={t.id}
              glyph={GLYPH[t.kind] ?? "✎"}
              title={t.title}
              related={t.ticketKey ?? t.workflowCode ?? undefined}
              meta={t.origin === "adhoc" ? "ad-hoc" : undefined}
              subtitle={t.subtitle || subtitleFor(t.state, t.reads.length)}
              reads={t.reads}
              action={
                <StartButton
                  taskId={t.id}
                  engagement={engagement}
                  role={actor.roleCode}
                  state={t.state}
                  executor={t.executor}
                  href={`/v2/e/${engagement}/jobs/${t.id}?role=${actor.roleCode}`}
                  openQuestions={t.openQuestions}
                  // A machine row is measured, not performed. Offering "Start with agent" on one
                  // hands the agent a task slug its own file does not define.
                  machine={t.stepKind === "machine"}
                />
              }
              agent={t.agentLabel ?? undefined}
              footer={
                <>
                  <Gate statuses={gates.get(t.id) ?? []} kind="ready" />
                  <Gate statuses={gates.get(t.id) ?? []} kind="done" />
                </>
              }
            />
          ))}
        </div>
      )}

      {others.length > 0 && (
        <section className="jobs-others">
          <h3 className="jobs-others-head">Across the engagement</h3>
          <p className="text-muted jobs-others-blurb">
            Not yours to do — {actor.roleLabel} sees the whole engagement. Each
            says who owns it.
          </p>
          <div className="jobs-list">
            {others.map((t) => (
              <JobCard
                key={t.id}
                glyph={GLYPH[t.kind] ?? "✎"}
                title={t.title}
                related={t.ticketKey ?? t.workflowCode ?? undefined}
                // The owning role, on the card. Without it the queue claimed four jobs were John's.
                meta={
                  roles.find((r) => r.code === t.roleCode)?.label ?? t.roleCode
                }
                subtitle={t.subtitle || subtitleFor(t.state, t.reads.length)}
                reads={t.reads}
                action={
                  <a
                    className="btn btn-secondary"
                    href={`/v2/e/${engagement}/jobs/${t.id}?role=${t.roleCode}`}
                  >
                    Open as{" "}
                    {roles.find((r) => r.code === t.roleCode)?.holder ??
                      t.roleCode}
                  </a>
                }
                agent={t.agentLabel ?? undefined}
                footer={
                  <>
                    <Gate statuses={gates.get(t.id) ?? []} kind="ready" />
                    <Gate statuses={gates.get(t.id) ?? []} kind="done" />
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}

      <p className="jobs-footer text-muted">
        Every job above writes into the same shared content —{" "}
        <a href={`/v2/e/${engagement}/content`}>see what&apos;s shared</a> and
        who may edit it.
      </p>
    </div>
  );
}

/** A card with no subtitle of its own still has to say something true. */
function subtitleFor(state: string, readCount: number): string {
  if (state === "idle") {
    return readCount > 0
      ? "Nothing drafted yet — the agent will read the documents below, then ask you what it can't infer."
      : "Nothing drafted yet. Starting this opens a conversation with the agent.";
  }
  if (state === "running")
    return "The agent is working. It will stop and ask if it hits something it cannot infer.";
  if (state === "awaiting")
    return "Waiting on you — the agent asked a question it will not answer for you.";
  if (state === "hitl") return "Drafted and waiting for approval.";
  return "";
}
