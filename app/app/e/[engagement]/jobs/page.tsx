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
import {
  tasksFor,
  startedCounts,
  queueNotices,
  groupByParent,
  type QueueGroup,
  type TaskCard,
} from "@/app/lib/data/tasks";
import { storedStatusFor } from "@/app/lib/data/gates";
import { phasesFor } from "@/app/lib/data/phases";
import { PhaseStarter } from "./PhaseStarter";
import { JobCard } from "../../../_ui/primitives";
import { StartButton } from "./StartButton";
import { Gate, doneAllMet } from "./Gate";
import { ChildRows } from "./ChildRows";

export const dynamic = "force-dynamic";

/** What a role's queue is FOR, said in one line. Falls back to something true but plain. */
const BLURB: Record<string, string> = {
  "delivery-manager":
    "Setting the engagement up so every other queue can fill.",
  pm: "Your PM agent has read the strategy doc, the SOW and this week's support themes. It has drafted nothing yet.",
  "product-owner":
    "Stories to shape and refine before they reach the build queue.",
  engineer: "Stories arrive here tech-ready; the agent implements, you review.",
  "staff-engineer": "Technical designs to author against the code as it actually is.",
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
  props: PageProps<"/e/[engagement]/jobs">,
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

  // Narrowed once. `groupCard` below is a function declaration, and TypeScript will not carry the
  // `if (!actor) notFound()` narrowing into one.
  const myRole = actor.roleCode;

  // Every row inside the row that opened it. A nesting row's card IS its run — grouping before the
  // split, because a group is placed by who is in it and that cannot be decided one row at a time.
  const groups = groupByParent(tasks);
  const isMine = (g: QueueGroup) =>
    g.card.roleCode === myRole ||
    // A staff engineer's `tech-design` rows hang off a product owner's `epics` row. Placing the
    // group on the parent alone would file their own work under "not yours to do".
    g.children.some((c) => c.roleCode === myRole);
  const mine = groups.filter(isMine);
  const others = groups.filter((g) => !isMine(g));

  // Read-only: rendering shows what was last measured, it does not re-measure. A refresh that
  // silently re-checked would make stale evidence look fresh.
  const gates = await storedStatusFor(tasks.map((t) => t.id));
  const firstName = (actor.holder ?? actor.roleLabel).split(" ")[0];
  const holderOf = (code: string) =>
    roles.find((r) => r.code === code)?.holder ??
    roles.find((r) => r.code === code)?.label ??
    code;

  // A SECOND read, deliberately. Both sentences below are claims about absence, and the queue is
  // the one set that cannot support them: it drops closed work, so once the SOW was accepted every
  // row left in it had a null started_at and the screen announced that nothing had ever run.
  //
  // Counted over ROWS, not groups. Grouping changed how the queue is drawn, not how much work is in
  // it, and a notice that counted cards would start calling a run of six rows one piece of work.
  const started = await startedCounts(actor);
  const notice = queueNotices({
    mineQueued: tasks.filter((t) => t.roleCode === actor.roleCode).length,
    totalQueued: tasks.length,
    startedMine: started.mine,
    startedVisible: started.visible,
  });

  /**
   * One card, holding whatever run its row opened.
   *
   * One function for both lists, and the control is chosen by WHO OWNS THE ROW rather than by which
   * list the card landed in. A group reaches "here's your work" when the actor owns the parent or
   * any row inside it, so the two questions genuinely differ: a staff engineer sees the product
   * owner's `epics` card in their own queue, because their technical designs are inside it, and
   * that card still offers the product owner's way in rather than a control that is not theirs.
   */
  function groupCard(g: QueueGroup) {
    const t = g.card;
    const owned = t.roleCode === myRole;
    const statuses = gates.get(t.id) ?? [];
    const href = `/e/${engagement}/jobs/${t.id}?role=${t.roleCode}`;
    return (
      <JobCard
        key={t.id}
        glyph={GLYPH[t.kind] ?? "✎"}
        title={t.title}
        related={t.ticketKey ?? t.workflowCode ?? undefined}
        // The owning role, on the card. Without it the queue claimed four jobs were John's.
        meta={
          owned
            ? t.origin === "adhoc"
              ? "ad-hoc"
              : undefined
            : holderOf(t.roleCode)
        }
        subtitle={t.subtitle || subtitleFor(t, g.children)}
        reads={t.reads}
        action={
          owned ? (
            <StartButton
              taskId={t.id}
              engagement={engagement}
              role={myRole}
              state={t.state}
              executor={t.executor}
              href={href}
              openQuestions={t.openQuestions}
              // A machine row is measured, not performed. Offering "Start with agent" on one
              // hands the agent a task slug its own file does not define.
              machine={t.stepKind === "machine"}
              // Satisfied by a whole workflow. Pressing it opens that run — which is what it
              // already did, without saying so.
              nests={t.nests}
              // A card reading "DONE 2 of 2 met" whose only control is "Open the job", on a job
              // page with nothing to press, is the state `CT-151` sat in. What the card already
              // shows decides what it offers.
              doneMet={doneAllMet(statuses)}
            />
          ) : (
            <a className="btn btn-secondary" href={href}>
              Open as {holderOf(t.roleCode)}
            </a>
          )
        }
        agent={t.agentLabel ?? undefined}
        footer={
          <>
            <Gate statuses={statuses} kind="ready" />
            <Gate statuses={statuses} kind="done" />
            {/* The work this row opened, where the row is — not as loose cards elsewhere in the
                queue wearing, four times out of ten, the same name as this one. */}
            <ChildRows
              engagement={engagement}
              actorRole={myRole}
              rows={g.children}
              gates={gates}
              holderOf={holderOf}
            />
          </>
        }
      />
    );
  }

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
            <a href={`/e/${engagement}/history`}>the history</a>. The next
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
        <div className="jobs-list">{mine.map((g) => groupCard(g))}</div>
      )}

      {others.length > 0 && (
        <section className="jobs-others">
          <h3 className="jobs-others-head">Across the engagement</h3>
          <p className="text-muted jobs-others-blurb">
            Not yours to do — {actor.roleLabel} sees the whole engagement. Each
            says who owns it.
          </p>
          <div className="jobs-list">{others.map((g) => groupCard(g))}</div>
        </section>
      )}

      <p className="jobs-footer text-muted">
        Every job above writes into the same shared content —{" "}
        <a href={`/e/${engagement}/content`}>see what&apos;s shared</a> and
        who may edit it.
      </p>
    </div>
  );
}

/**
 * A card with no subtitle of its own still has to say something true.
 *
 * A NESTING ROW IS ANSWERED FIRST, before anything is read off `state`. Deciding from state alone
 * put "The agent is working" on a row that will never have an agent — directly above the line
 * admitting "no agent attached yet" — and said it for the fifty minutes `CT-153` spent looking
 * stuck while its actual work sat, unstarted, in the run it had opened.
 */
function subtitleFor(t: TaskCard, children: TaskCard[]): string {
  if (t.nests) {
    if (!children.length) {
      // Either it has not been opened, or every row of it has closed and dropped out of the queue.
      // The row's own state is what tells those apart — an idle row has opened nothing.
      return t.state === "idle"
        ? `Satisfied by the ${t.nests} workflow, not by an agent. Opening it creates its steps.`
        : `The ${t.nests} run has finished. This row closes when its own Done criteria are met.`;
    }
    const open = children.filter((c) => c.state !== "closed").length;
    return open
      ? `The ${t.nests} run is open — ${open} of ${children.length} row${children.length === 1 ? "" : "s"} still to do, below.`
      : `Every row of the ${t.nests} run is done. This row closes when its own Done criteria are met.`;
  }
  if (t.state === "idle") {
    return t.reads.length > 0
      ? "Nothing drafted yet — the agent will read the documents below, then ask you what it can't infer."
      : "Nothing drafted yet. Starting this opens a conversation with the agent.";
  }
  if (t.state === "running")
    return "The agent is working. It will stop and ask if it hits something it cannot infer.";
  if (t.state === "awaiting")
    return "Waiting on you — the agent asked a question it will not answer for you.";
  if (t.state === "hitl") return "Drafted and waiting for approval.";
  return "";
}
