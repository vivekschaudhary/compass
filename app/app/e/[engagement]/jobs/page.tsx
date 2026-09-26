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
import { workflowsFor } from "@/app/lib/data/workflows-view";
import { WorkflowsTable } from "./WorkflowsTable";
import { TasksTable } from "./TasksTable";

export const dynamic = "force-dynamic";

/** What a role's queue is FOR, said in one line. Falls back to something true but plain. */
const BLURB: Record<string, string> = {
  "delivery-manager":
    "Setting the engagement up so every other queue can fill.",
  pm: "Your PM agent has read the strategy doc, the SOW and this week's support themes. It has drafted nothing yet.",
  "product-owner":
    "Stories to shape and refine before they reach the build queue.",
  engineer: "Stories arrive here tech-ready; the agent implements, you review.",
  "staff-engineer":
    "Technical designs to author against the code as it actually is.",
  designer: "Design specs and the library every screen is built from.",
  reviewer:
    "Diffs to review on a fresh context — you see the change and the spec, not the history.",
};

// JobsPage is a server component that renders one role's queue:

// Who is looking — takes role from the query (first value if repeated), falls back to the first staffed role, resolves it to an Actor, and 404s if neither exists.
// What they can see — two flat tables, not one mixed list: workflowsFor(actor) (every workflow_run
// this role owns, however many hops of nesting or fan-out opened it) and tasksFor(actor) (this
// role's own individually assigned rows, with anything that nests a workflow filtered out — that's
// a Workflows-table entry instead, never both).
// What each card shows — storedStatusFor reads the last measured gate statuses, deliberately read-only: rendering never re-measures, so stale evidence can't look fresh.
// The empty-state notice — a second, separate count (startedCounts) over rows rather than groups, because the queue drops closed work and would otherwise claim nothing had ever run.

export default async function JobsPage(
  props: PageProps<"/e/[engagement]/jobs">,
) {
  const { engagement } = await props.params;
  const search = await props.searchParams;
  // A query parameter can legitimately arrive repeated; take the first rather than stringifying
  // an array into a role code that matches nothing.
  const role = Array.isArray(search.role) ? search.role[0] : search.role;
  const holderId = Array.isArray(search.holder) ? search.holder[0] : search.holder;

  const roles = await rolesOnEngagement(engagement);
  const staffed = roles.filter((r) => r.holder);
  const roleCode = role ?? staffed[0]?.code;
  if (!roleCode) notFound();

  const actor = await resolveActor(engagement, roleCode, holderId);
  if (!actor) notFound();

  const tasks = await tasksFor(actor);
  const workflows = await workflowsFor(actor);

  const myRole = actor.roleCode;

  // Read-only: rendering shows what was last measured, it does not re-measure. A refresh that
  // silently re-checked would make stale evidence look fresh.
  const gates = await storedStatusFor(tasks.map((t) => t.id));
  const firstName = (actor.holder ?? actor.roleLabel).split(" ")[0];

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

  return (
    <div className="page page-wide">
      <h2>{firstName}, here&apos;s your work</h2>
      <p className="jobs-blurb">
        {BLURB[actor.roleCode] ??
          `Work assigned to the ${actor.roleLabel.toLowerCase()} on this engagement.`}
      </p>

      {notice.banner === "never-run" && (
        <p className="jobs-note">
          Nothing has run yet. Each job starts a conversation with an agent when
          — and only when — you click it.
        </p>
      )}

      <WorkflowsTable engagement={engagement} role={actor.roleCode} workflows={workflows} />

      {notice.empty === "all-done" && workflows.length === 0 ? (
        // An engagement that has finished its work presents exactly like one that has not begun —
        // no cards either way. Telling a delivery manager who just closed the SOW that work will
        // arrive once the kickoff backlog is shaped is the same defect as the banner, one sentence
        // further down: the queue was asked which of the two this is, and it cannot know.
        <div className="jobs-empty">
          <p className="jobs-empty-title">Everything here is done</p>
          <p className="text-muted">
            {`Nothing is open for ${actor.roleLabel} on this engagement.`} What
            has already run — what it produced, who accepted it and where it was
            published — is in{" "}
            <a href={`/e/${engagement}/history`}>the history</a>. The next phase
            puts new work here.
          </p>
        </div>
      ) : notice.empty === "none-yet" && workflows.length === 0 ? (
        <div className="jobs-empty">
          <p className="jobs-empty-title">Nothing in your queue</p>
          <p className="text-muted">
            {`No work is assigned to ${actor.roleLabel} here yet.`} Work arrives
            when an upstream job publishes — on a new engagement that means the
            kickoff backlog, which the Delivery Manager shapes first.
          </p>
        </div>
      ) : notice.empty === "waiting" && workflows.length === 0 ? (
        // Distinct from both the others on purpose — see `queueNotices`'s own doc comment. This is
        // an `everyone`-scope role (Principal Engineer, PM) between gates, not a stalled or a
        // finished engagement: plenty is happening, just nothing needs THIS role's eyes right now.
        <div className="jobs-empty">
          <p className="jobs-empty-title">All clear</p>
          <p className="text-muted">
            {`Nothing needs ${actor.roleLabel} right now.`} The rest of the
            engagement is carrying on without you — check{" "}
            <a href={`/e/${engagement}/history`}>the history</a> if you&apos;re
            curious what&apos;s moving. We&apos;ll fill this queue the moment
            something reaches your gate.
          </p>
        </div>
      ) : (
        <TasksTable tasks={tasks} engagement={engagement} myRole={myRole} gates={gates} />
      )}
    </div>
  );
}
