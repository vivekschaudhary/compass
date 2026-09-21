// Clear an engagement's WORK, keeping the engagement.
//
// The engagement, its people and its connector config survive; everything the process produced on
// it does not. That is the shape wanted when the process itself is rewritten: the rows describe a
// graph that no longer exists, and there is nothing to migrate them onto.
//
// IT RUNS BEFORE AN IMPORT, NOT AFTER, and the order is load-bearing rather than tidy. With
// `COMPASS_WORKFLOW_VERSIONS` off — the default — an import AMENDS the published version in place,
// and `syncSteps` deletes any step row the seed no longer has. `work_task.workflow_step_id` has no
// `on delete` rule, so one live task pointing at a removed step makes that delete fail; and
// `applyPlan` deliberately runs in no transaction, so the import would stop half-applied. Clearing
// the tasks first means that cannot happen.
//
// The planning is pure and the writing is not, for the same reason `planImport` is split from
// `applyPlan`: the part that can be wrong is the ordering and the exemptions, and those are worth
// testing without a database.

import type { Refusal } from "../envelope";

/** What the engagement currently holds. Read by the caller; this module does no I/O. */
export type ResetSnapshot = {
  engagementId: string;
  /** `workflowRunId` is null for ad-hoc work — see why that matters in `planReset`. */
  tasks: { id: string; workflowRunId: string | null }[];
  runs: { id: string }[];
  /** `externalUrl` non-null means a page exists in the doc store that this does NOT delete. */
  documents: { id: string; path: string; externalUrl: string | null }[];
  events: { id: string; verb: string }[];
};

export type DeleteStep = {
  table: string;
  ids: string[];
  /** What goes with it by `on delete cascade`, so the report names it rather than the reader guessing. */
  cascades: string[];
  why: string;
};

export type ResetPlan = {
  engagementId: string;
  /** In execution order. */
  deletes: DeleteStep[];
  keeps: { table: string; count: number; why: string }[];
  /**
   * Documents whose page lives in Confluence or Teams.
   *
   * Counted and reported because this clears COMPASS'S SIDE ONLY. Deleting the row here does not
   * remove the page there, and a reset that said nothing about it would read as having removed
   * both.
   */
  publishedElsewhere: number;
};

export type ResetResult = { ok: true; plan: ResetPlan } | { ok: false; refusals: Refusal[] };

/**
 * The one event kept.
 *
 * An engagement that survives its reset should still be able to say when it began and who created
 * it. Everything else in the log describes tasks and gates that no longer exist.
 */
export const KEPT_VERB = "engagement.created";

export function planReset(snap: ResetSnapshot): ResetResult {
  if (!snap.engagementId) {
    return { ok: false, refusals: [{
      message: "No engagement named.",
      fix: "Pass an engagement id, or --all to reset every engagement.",
    }] };
  }

  const total = snap.tasks.length + snap.runs.length + snap.documents.length + snap.events.length;
  if (total === 0) {
    // REFUSED, not reported as a successful no-op. The overwhelmingly likely cause of "nothing to
    // delete" is a mistyped id, and a reset that prints four zeroes and exits 0 looks exactly like
    // one that worked — so the next thing anyone does is run the import against an engagement that
    // was never cleared.
    return { ok: false, refusals: [{
      message: `Engagement '${snap.engagementId}' holds no tasks, runs, documents or events.`,
      fix: "Check the id. An engagement with nothing on it is usually a name that does not exist, " +
           "not one that is already clear.",
    }] };
  }

  const events = snap.events.filter((e) => e.verb !== KEPT_VERB);

  return { ok: true, plan: {
    engagementId: snap.engagementId,
    deletes: [
      {
        // BY ENGAGEMENT, never by walking the runs. `work_task.workflow_run_id` is nullable — ad-hoc
        // work has no run and no step — so deleting runs alone strands every unplanned task on the
        // engagement, which is the half of the board that records what actually happened.
        table: "work_task",
        ids: snap.tasks.map((t) => t.id),
        cascades: ["task_input", "measurement", "turn", "question", "backlog_item"],
        why: "the queue, its gate measurements and its agent turns",
      },
      {
        table: "workflow_run",
        ids: snap.runs.map((r) => r.id),
        cascades: [],
        why: "the runs those tasks belonged to",
      },
      {
        // `document.current_version_id` has no `on delete` rule, so the caller nulls it before this
        // rather than relying on Postgres to order the cascade for us.
        table: "document",
        ids: snap.documents.map((d) => d.id),
        cascades: ["document_version", "document_section", "citation"],
        why: "the deliverables and every version, section and citation under them",
      },
      {
        table: "event",
        ids: events.map((e) => e.id),
        cascades: [],
        why: `the audit log, except ${KEPT_VERB}`,
      },
    ],
    keeps: [
      { table: "engagement", count: 1, why: "the engagement itself is not being deleted" },
      { table: "event", count: snap.events.length - events.length,
        why: `${KEPT_VERB} — so the engagement keeps a recorded origin` },
      { table: "member", count: -1, why: "the people on it" },
      { table: "doc_page", count: -1,
        why: "the scaffolded doc tree is an INPUT, not a mirror — adoptV1DocTree reads it to rebuild documents" },
      { table: "repo", count: -1, why: "connector config" },
      { table: "workflow / workflow_version / workflow_step / criterion", count: -1,
        why: "config, which the import rewrites" },
    ],
    publishedElsewhere: snap.documents.filter((d) => d.externalUrl).length,
  } };
}

/** One line per step, for the report. Counts are printed whether or not anything is written. */
export function describeReset(plan: ResetPlan): string[] {
  const out = plan.deletes.map((d) => {
    const cascade = d.cascades.length ? `  → cascades to ${d.cascades.join(", ")}` : "";
    return `  ${String(d.ids.length).padStart(5)}  ${d.table.padEnd(14)} ${d.why}${cascade}`;
  });
  const kept = plan.keeps.find((k) => k.table === "event")!;
  if (kept.count > 0) out.push(`  ${String(kept.count).padStart(5)}  event          KEPT — ${KEPT_VERB}`);
  return out;
}
