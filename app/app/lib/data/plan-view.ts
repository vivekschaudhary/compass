// The engagement's whole plan — every phase, its workflows, and cycles for whichever phase's
// catalog row asks for them — read the same way regardless of which role is looking.
//
// Every other workflow query in this app (`workflowsFor`) is scoped to `actor.roleCode` on purpose:
// a personal queue should only ever show what is MINE. This page is the deliberate exception — a
// delivery manager or exec wants the whole tree, not their own slice of it — so nothing here filters
// by role at all.
//
// NOTHING HERE NAMES A PHASE. Which lanes exist, their left-to-right order, their display label, and
// whether a lane groups by sprint cycle all come from the `phase` table (see its own migration
// comment — a display band, deliberately carrying no state). A phase this org has never catalogued
// still gets a lane — falling back to its raw code, sorted after every catalogued one — so a new
// phase always renders as SOMETHING the moment a workflow or a run claims it, never nothing.
//
// TWO WAYS A RUN GETS A PHASE, because one workflow definition is not always one phase. Most
// workflows (`sprint-0`, `timeline`, `product-brief`) have exactly one home, so `workflow.phase_code`
// settles it. But `workflow_run.phase_tag` exists precisely because a REPEATING standalone workflow
// does not: per its own migration comment, the same workflow code can be "early feature-building
// work, post-launch stabilization, or long-tail support" across different runs of itself, and
// nothing on the workflow row can say which. So a ROOT workflow's own runs are bucketed by
// `run.phase_tag ?? workflow.phase_code` — the tag wins when a run carries one. This is scoped to
// root-level runs only: a NESTED run (opened from inside another workflow's own tree, e.g.
// `sprint-0`'s `draft-product-brief`) stays bound to its parent's tree either way, so its own phase
// boundary check still compares its workflow's catalog `phase_code` — there is no described case yet
// of a nested run wanting to escape into a different lane than the tree it opened inside.
//
// THE NESTING RULE (for nested runs): a workflow's own steps are walked recursively only while the
// nested workflow's `phase_code` matches the phase being rendered. `sprint-0` (Discovery) nests
// `feature`, `feature-architecture` and `sprint-plan` — all three are Build-phase workflows reached
// one hop early, and expanding them here would show Build's fan-out work sitting inside Discovery's
// tree, duplicated with however Build renders it. Stopping at the phase boundary keeps each phase's
// tree self-contained; the row still renders, just as a leaf rather than expanding further.
//
// A ROOT is a workflow nothing else ever nests — `onboarding`, `sprint-0`, and `build` today.
// `feature`, `feature-architecture`, `tech-design` and `sprint-plan` are all reached only as
// someone else's nested step, so they have no root entry of their own; `workflowsFor` on the Jobs
// page already shows them to whoever owns them.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { orgIdFor } from "./events";
import { jiraForEngagement, searchIssues } from "../jira";
import { sprintJql, maxSprintNo } from "./sprint";

export type PlanTaskNode = {
  taskId: string;
  ord: number;
  title: string;
  roleCode: string | null;
  state: string;
  /** Set only when this step nests a workflow AND that workflow's phase matched, so `nested`
   *  actually has something in it — see the file header's nesting rule. */
  nestsCode: string | null;
  nested: PlanWorkflowNode[];
};

export type PlanWorkflowNode = {
  code: string;
  label: string;
  ownerRole: string;
  /** The run's own state — never reinterpreted as "available to run again". A closed, repeatable
   *  workflow reports `closed`, same as a one-shot one; whether it can run again is a different
   *  fact from whether THIS run finished, and conflating them is what made `2/2 closed` sit next to
   *  a chip reading "not started". */
  state: "idle" | "open" | "closed";
  /** Which phase this NODE belongs to — usually its workflow's own `phase_code`, but for a root
   *  workflow's run this is `run.phase_tag ?? phase_code` (see the file header). Used to bucket
   *  root nodes into lanes; harmless, and occasionally useful, to keep on nested nodes too. */
  phase: string;
  subject: string | null;
  runId: string | null;
  /** The row to click before it opens — same meaning as `WorkflowCard.taskId`. */
  taskId: string | null;
  closedCount: number;
  totalCount: number;
  steps: PlanTaskNode[];
};

export type PlanCycleIssue = {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
};

export type PlanCycle = {
  n: number;
  label: string;
  /** Null means the tracker could not be read for this cycle — not configured, or the call
   *  failed. Never conflated with "read it, found nothing" (`[]`). */
  issues: PlanCycleIssue[] | null;
};

export type PlanPhase = {
  code: string;
  label: string;
  /** Standalone workflows (or run-instances of one) in this phase. Usually one; never assumed. */
  roots: PlanWorkflowNode[];
  /** Present only when this phase's own catalog row asks for cycles. Absent, not empty, for every
   *  other phase — an empty array would read as "no cycles yet" on a phase never going to have any. */
  cycles?: PlanCycle[];
};

type WorkflowRow = {
  id: string; code: string; label: string; phase_code: string | null;
  owner_role_code: string | null; repeatable: boolean;
};

type PhaseCatalogRow = { code: string; label: string; ord: number; cycles: boolean };

const MAX_DEPTH = 6;

async function stepsOfRun(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>,
  runId: string,
  byCode: Map<string, WorkflowRow>,
  phase: string,
  depth: number,
): Promise<PlanTaskNode[]> {
  const { data: tasks } = await sb
    .from("work_task")
    .select("id, role_code, state, title, workflow_step(ord, nests_workflow_code)")
    .eq("workflow_run_id", runId);

  const rows = (tasks ?? []).map((t) => {
    const step = Array.isArray(t.workflow_step) ? t.workflow_step[0] : t.workflow_step;
    return {
      taskId: t.id as string,
      roleCode: (t.role_code as string | null) ?? null,
      state: t.state as string,
      title: t.title as string,
      ord: (step?.ord as number | null) ?? 0,
      nestsCode: (step?.nests_workflow_code as string | null) ?? null,
    };
  });
  rows.sort((a, b) => a.ord - b.ord);

  const out: PlanTaskNode[] = [];
  for (const r of rows) {
    let nested: PlanWorkflowNode[] = [];
    // The phase boundary — see the file header. A nested code this org never defined (a stale
    // seed row) resolves to no match and is left a leaf, same as a genuine cross-phase one.
    const target = r.nestsCode ? byCode.get(r.nestsCode) : null;
    if (target && target.phase_code === phase && depth < MAX_DEPTH) {
      nested = await runsOfWorkflow(sb, target, byCode, depth + 1, r.taskId, phase);
    }
    out.push({
      taskId: r.taskId, ord: r.ord, title: r.title, roleCode: r.roleCode, state: r.state,
      nestsCode: r.nestsCode, nested,
    });
  }
  return out;
}

/**
 * Every run of one workflow that opened under `parentTaskId` (or, for a true standalone, at all).
 *
 * `fallbackPhase` is the phase to walk NESTED steps under — the current phase being rendered, same
 * as before. For a ROOT call (`parentTaskId === null`) it is ignored: a root's own effective phase
 * is computed per-run below, from that run's own `phase_tag`, and THAT is what its children walk
 * under instead.
 */
async function runsOfWorkflow(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>,
  wf: WorkflowRow,
  byCode: Map<string, WorkflowRow>,
  depth: number,
  parentTaskId: string | null,
  fallbackPhase: string,
): Promise<PlanWorkflowNode[]> {
  let q = sb
    .from("workflow_run")
    .select("id, state, subject_ref, opened_at, phase_tag")
    .eq("workflow_id", wf.id)
    .order("opened_at", { ascending: false });
  q = parentTaskId ? q.eq("parent_task_id", parentTaskId) : q.is("parent_task_id", null);
  const { data: runs } = await q;

  if (!runs?.length) {
    // Not opened yet. For a genuine standalone (no parent task at all) there is nothing to point
    // at; for a nesting row, the row itself — still idle — is what a viewer would click. No run
    // exists to carry a tag, so this falls back to the workflow's own catalog phase.
    return [{
      code: wf.code, label: wf.label, ownerRole: wf.owner_role_code ?? "",
      state: "idle", phase: wf.phase_code ?? fallbackPhase,
      subject: null, runId: null, taskId: parentTaskId,
      closedCount: 0, totalCount: 0, steps: [],
    }];
  }

  const out: PlanWorkflowNode[] = [];
  for (const r of runs) {
    // Root only: the tag on THIS run wins over the workflow's own catalog phase. A nested run has
    // no such choice — it walks under whatever phase its parent is already being rendered as.
    const phase = parentTaskId
      ? fallbackPhase
      : ((r.phase_tag as string | null) ?? wf.phase_code ?? fallbackPhase);
    const steps = await stepsOfRun(sb, r.id as string, byCode, phase, depth);
    const total = steps.length;
    const closed = steps.filter((s) => s.state === "closed").length;
    out.push({
      code: wf.code,
      label: r.subject_ref ? `${wf.label} — ${r.subject_ref}` : wf.label,
      ownerRole: wf.owner_role_code ?? "",
      state: r.state === "closed" ? "closed" : "open",
      phase,
      subject: (r.subject_ref as string | null) ?? null,
      runId: r.id as string,
      taskId: parentTaskId,
      closedCount: closed,
      totalCount: total,
      steps,
    });
  }
  return out;
}

export async function planFor(engagementId: string): Promise<PlanPhase[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const orgId = await orgIdFor(engagementId);
  if (!orgId) return [];

  const [{ data: wfRows }, { data: catalogRows }] = await Promise.all([
    sb.from("workflow").select("id, code, label, phase_code, owner_role_code, repeatable")
      .eq("org_id", orgId).eq("enabled", true),
    sb.from("phase").select("code, label, ord, cycles")
      .eq("org_id", orgId).is("engagement_id", null).eq("enabled", true).order("ord"),
  ]);
  const workflows = (wfRows ?? []) as WorkflowRow[];
  const byCode = new Map(workflows.map((w) => [w.code, w]));
  const catalog = new Map((catalogRows ?? []).map((p) => [p.code as string, p as PhaseCatalogRow]));

  const { data: versions } = await sb.from("workflow_version").select("id, workflow_id")
    .in("workflow_id", workflows.map((w) => w.id));
  const { data: nestingSteps } = versions?.length
    ? await sb.from("workflow_step").select("nests_workflow_code")
        .in("workflow_version_id", versions.map((v) => v.id as string))
        .not("nests_workflow_code", "is", null)
    : { data: [] };
  const nestedCodes = new Set((nestingSteps ?? []).map((s) => s.nests_workflow_code as string));

  // A root: a workflow nothing else ever nests. Every root's runs are fetched ONCE, unbucketed by
  // phase — each run's own effective phase (`phase_tag ?? phase_code`) decides its lane, not the
  // phase it happened to be looked up under.
  const roots = workflows.filter((w) => !nestedCodes.has(w.code));
  const nodesByPhase = new Map<string, PlanWorkflowNode[]>();
  for (const root of roots) {
    const nodes = await runsOfWorkflow(sb, root, byCode, 0, null, root.phase_code ?? "");
    for (const node of nodes) {
      const list = nodesByPhase.get(node.phase) ?? [];
      list.push(node);
      nodesByPhase.set(node.phase, list);
    }
  }

  const phases: PlanPhase[] = [];
  for (const [code, roots] of nodesByPhase) {
    const cat = catalog.get(code);
    const phase: PlanPhase = { code, label: cat?.label ?? code, roots };
    if (cat?.cycles) phase.cycles = await cyclesFor(engagementId);
    phases.push(phase);
  }

  // Catalogued phases sort by their own authored `ord`; anything this org has never catalogued
  // (a run tagged with a phase nobody has added to `phase` yet) sorts after all of them, so a new
  // phase still shows up the moment something claims it rather than waiting on a seed update.
  phases.sort((a, b) => {
    const oa = catalog.get(a.code)?.ord, ob = catalog.get(b.code)?.ord;
    if (oa !== undefined && ob !== undefined) return oa - ob;
    if (oa !== undefined) return -1;
    if (ob !== undefined) return 1;
    return a.code.localeCompare(b.code);
  });
  return phases;
}

async function cyclesFor(engagementId: string): Promise<PlanCycle[]> {
  const n = await maxSprintNo(engagementId);
  if (!n) return [];

  const creds = await jiraForEngagement(engagementId);
  const cycles: PlanCycle[] = [];
  for (let i = 1; i <= n; i++) {
    if (!creds) {
      cycles.push({ n: i, label: `Cycle ${i}`, issues: null });
      continue;
    }
    const found = await searchIssues(creds, sprintJql(creds.project, i), ["summary", "status", "assignee"]);
    cycles.push({
      n: i,
      label: `Cycle ${i}`,
      issues: found
        ? found.map((iss) => ({
            key: iss.key,
            summary: (iss.fields.summary as string | undefined) ?? "",
            status: ((iss.fields.status as { name?: string } | undefined)?.name) ?? "Unknown",
            assignee: (iss.fields.assignee as { displayName?: string } | undefined)?.displayName ?? null,
          }))
        : null,
    });
  }
  return cycles;
}
