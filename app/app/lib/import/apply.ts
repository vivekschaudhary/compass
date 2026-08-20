// Apply a plan — turn the reviewed diff into rows.
//
// NO TRANSACTION, deliberately. Config import is idempotent: every write is keyed by a natural
// key, so re-running converges on the same state. A half-applied import is repaired by running it
// again, which is a guarantee you can actually rely on.
//
// That is NOT true of transitions. `close_task` writes history — an event that cannot be written
// twice and cannot be reconstructed — so those are Postgres routines with state change and event
// in one transaction. Different guarantees, different mechanisms, and worth keeping straight:
// reaching for a routine here would buy nothing, and reaching for upserts there would lose the
// record.
//
// The store is an interface rather than the Supabase client so the ordering logic — which is the
// part that can actually be wrong — is testable without a database.

import type { Plan, WorkstreamRow, RoleRow, WorkflowRow, StepRow, CriterionRow } from "./plan";

/** Which tier is being written: an org default, or one engagement's override. */
export type Scope = { orgCode: string; engagementId: string | null };

export interface ConfigStore {
  /** Find the org by code, or create it. Everything else hangs off this. */
  orgId(code: string): Promise<string>;

  upsertWorkstream(orgId: string, engagementId: string | null, row: WorkstreamRow): Promise<void>;
  upsertRole(orgId: string, engagementId: string | null, row: RoleRow): Promise<void>;

  /** Upsert the workflow itself (its label, owner, trigger) and return its id. */
  upsertWorkflow(orgId: string, engagementId: string | null, row: WorkflowRow): Promise<string>;

  /** Highest version number this workflow has, or 0. */
  latestVersion(workflowId: string): Promise<number>;

  /** Mark whatever is currently published as superseded. */
  supersedePublished(workflowId: string): Promise<void>;

  createVersion(workflowId: string, version: number, notes: string, createdBy: string): Promise<string>;
  addSteps(versionId: string, steps: StepRow[]): Promise<void>;
  addCriteria(versionId: string, criteria: CriterionRow[]): Promise<void>;

  /**
   * Take a role or workflow out of service without deleting it.
   *
   * Disabled, not removed: `work_task.role_code` is text rather than a foreign key, so a delete
   * breaks nothing referentially and quietly breaks the agent lookup for every historical task that
   * named it. History has to keep resolving.
   */
  retire(orgId: string, engagementId: string | null, kind: "role" | "workflow", code: string): Promise<void>;
}

export type ApplyReport = {
  workstreams: number;
  roles: number;
  workflowsCreated: string[];
  versionsCreated: { workflow: string; version: number; because: string[] }[];
  skipped: string[];
  /** What was taken out of service, so the report says it rather than the roster quietly shrinking. */
  retired: string[];
};

export async function applyPlan(plan: Plan, scope: Scope, store: ConfigStore, actor = "import"): Promise<ApplyReport> {
  const orgId = await store.orgId(scope.orgCode);
  const eng = scope.engagementId;

  const report: ApplyReport = {
    workstreams: 0, roles: 0, workflowsCreated: [], versionsCreated: [], skipped: [], retired: [],
  };

  // Order matters and is not incidental: a role names a workstream, a workflow names both. Writing
  // them out of order would leave references dangling for as long as the import takes — which on a
  // slow connection is long enough for a concurrent read to see a broken graph.
  for (const w of plan.workstreams) {
    await store.upsertWorkstream(orgId, eng, w.row);
    report.workstreams++;
  }

  for (const r of plan.roles) {
    await store.upsertRole(orgId, eng, r.row);
    report.roles++;
  }

  for (const wf of plan.workflows) {
    // The workflow row itself is upserted either way — a label or owner may have changed without
    // the steps changing, and that is not worth a version.
    const workflowId = await store.upsertWorkflow(orgId, eng, wf.row);

    if (wf.action === "unchanged") {
      report.skipped.push(wf.row.code);
      continue;
    }
    if (wf.action === "create") report.workflowsCreated.push(wf.row.code);

    // A new version, never a mutation. Runs already in flight keep the version they pinned, which
    // is what makes "these twelve runs followed v1" a true statement rather than a hopeful one.
    const version = (await store.latestVersion(workflowId)) + 1;
    const because = wf.changes.length ? wf.changes : ["first version"];

    await store.supersedePublished(workflowId);
    const versionId = await store.createVersion(workflowId, version, because.join("; "), actor);
    await store.addSteps(versionId, wf.steps);
    await store.addCriteria(versionId, wf.criteria);

    report.versionsCreated.push({ workflow: wf.row.code, version, because });
  }

  // Last, and only what the plan named. Retiring after everything is written means a replacement is
  // already in place before its predecessor goes out of service — a rename never leaves a moment
  // where neither `pm` nor `product-manager` can be dispatched.
  for (const r of plan.retire) {
    await store.retire(orgId, eng, r.kind, r.code);
    report.retired.push(`${r.kind}:${r.code}`);
  }

  return report;
}

/** One line, for the confirmation screen and the run log. */
export function describeReport(r: ApplyReport): string {
  const bits = [
    `${r.workstreams} workstream(s)`,
    `${r.roles} role(s)`,
    r.workflowsCreated.length ? `${r.workflowsCreated.length} new workflow(s)` : "",
    r.versionsCreated.length ? `${r.versionsCreated.length} version(s) published` : "",
    r.skipped.length ? `${r.skipped.length} unchanged` : "",
    // Named, not counted. "2 retired" is a number someone scrolls past; "retired role:pm,
    // role:scanner" is the line that makes them check whether they meant it.
    r.retired.length ? `retired ${r.retired.join(", ")}` : "",
  ].filter(Boolean);
  return bits.join(" · ");
}
