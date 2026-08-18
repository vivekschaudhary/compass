// Turning the kickoff backlog into work — v1's `createSprint0`, ported.
//
// v1 read `compass/templates/sprint-0.md` — a table of `ticket | workflow | owner | gate` — and
// instantiated ONE ticket per row at kickoff. v2 authors that table per engagement instead of
// reading a static template (the agent produces `01-foundation/kickoff-backlog` with the same
// columns), and then nothing happened to it: Provider FFS finished its kickoff with a published
// nine-row backlog and exactly one task — the one that wrote the document.
//
// So this is not a new mechanism. It is v1's, reading the authored table instead of the shipped
// one, and it keeps v1's properties deliberately:
//
//   · idempotent — v1 checked for the Sprint 0 epic and did nothing if it existed. A row whose
//     workflow already has a run on this engagement is left alone, so running this twice is safe.
//   · readiness first, tickets after — v1 refused to cut the backlog until the connectors were
//     proven, because creating tickets against unverified Jira cannot repair itself.
//   · one routine — `open_workflow_run` opens the run AND creates its first task, which is how
//     every other task in the system comes to exist. Nothing here inserts a task by hand.
//   · honest reporting — a row that cannot be opened is returned as a problem, not skipped
//     silently. v1 reported `created / jira / closed`; this reports what opened and what did not.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./actor";
import { checkConnectors } from "./gates";
import { orgIdFor } from "./events";
import { parseBacklog } from "./backlog-rows";

export const BACKLOG_PATH = "01-foundation/kickoff-backlog";

export { parseBacklog, type BacklogRow } from "./backlog-rows";

export type Materialised = {
  opened: { ref: string; workflow: string }[];
  /** Already had a run — the idempotent case, not a failure. */
  skipped: { ref: string; workflow: string }[];
  problems: string[];
};

/**
 * Instantiate the backlog: one run per row that names a workflow.
 *
 * The gate is v1's, in v1's order — connectors proven BEFORE anything is created.
 */
export async function materialiseBacklog(actor: Actor): Promise<Materialised> {
  const out: Materialised = { opened: [], skipped: [], problems: [] };
  const sb = supabaseAdmin();
  if (!sb) return { ...out, problems: ["Supabase is not configured."] };

  // Readiness first. v1: "Provisioning stores credentials; it does not prove they work."
  const connectors = await checkConnectors(actor);
  const unproven = connectors.filter((c) => c.verdict.state !== "satisfied");
  if (unproven.length) {
    return { ...out, problems: unproven.map((c) => `${c.connector} is not proven: ${describe(c.verdict)}`) };
  }

  const { data: doc } = await sb.from("document")
    .select("current_version_id").eq("engagement_id", actor.engagementId).eq("path", BACKLOG_PATH).maybeSingle();
  if (!doc?.current_version_id) {
    return { ...out, problems: [`No ${BACKLOG_PATH} has been filed yet — there is nothing to instantiate.`] };
  }

  const { data: sections } = await sb.from("document_section")
    .select("body").eq("document_version_id", doc.current_version_id).order("ord");
  const rows = parseBacklog((sections ?? []).map((s) => s.body).join("\n\n"));
  if (!rows.length) return { ...out, problems: ["The backlog has no table with a Workflow column."] };

  const orgId = await orgIdFor(actor.engagementId);
  const { data: runs } = await sb.from("workflow_run")
    .select("workflow_id").eq("engagement_id", actor.engagementId);
  const { data: workflows } = await sb.from("workflow").select("id, code").eq("org_id", orgId);
  const codeOf = new Map((workflows ?? []).map((w) => [w.id as string, w.code as string]));
  const hasRun = new Set((runs ?? []).map((r) => codeOf.get(r.workflow_id as string)).filter(Boolean) as string[]);

  const who = actor.holder ?? actor.roleCode;
  for (const row of rows) {
    if (!row.workflowCode) continue;                       // a row intake itself satisfies
    if (hasRun.has(row.workflowCode)) {
      out.skipped.push({ ref: row.ref, workflow: row.workflowCode });
      continue;
    }

    const { data: runId, error } = await sb.rpc("open_workflow_run", {
      p_org_id: orgId, p_engagement_id: actor.engagementId,
      p_workflow_code: row.workflowCode, p_actor: who, p_actor_role: actor.roleCode,
    });
    if (error) {
      // The common case is a workflow the framework declares but has never given a dispatch graph
      // — the backlog says so itself ("STEPS UNSPECIFIED"). Naming it beats a silent gap.
      out.problems.push(`${row.ref} · ${row.workflowCode}: ${error.message}`);
      continue;
    }
    hasRun.add(row.workflowCode);

    // A run that opened is not work that exists. `open_workflow_run` creates the first task only if
    // the workflow HAS a first step — and seven of the nineteen seeded workflows have no dispatch
    // graph, which the backlog itself flags as "STEPS UNSPECIFIED". Opening those produced eight
    // runs and five tasks, and reported no problem at all. The run is the claim; the task is the
    // work, so the task is what gets checked.
    const { data: made } = await sb.from("work_task")
      .select("id").eq("workflow_run_id", runId as string).limit(1);
    if (!made?.length) {
      out.problems.push(
        `${row.ref} · ${row.workflowCode}: opened, but the workflow has no first step — ` +
        `no task was created. Its dispatch graph is unwritten.`);
      continue;
    }

    out.opened.push({ ref: row.ref, workflow: row.workflowCode });
  }

  return out;
}

const describe = (v: { state: string; why?: string; detail?: string }) =>
  ("why" in v && v.why) || ("detail" in v && v.detail) || v.state;
