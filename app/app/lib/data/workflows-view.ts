// The Workflows table — every workflow_run a role OWNS, flat, no matter how many hops of nesting
// opened it or how many times it fans out.
//
// Replaces `phasesFor`'s job for this purpose. That function deliberately HID a workflow while an
// open run nested it, and kept only the LATEST run per workflow_id — both were built for a single
// mixed queue where a nesting row's children rendered inline. Neither survives a flat table: hiding
// meant a nested workflow like `timeline` never got its own row at all, and "latest only" meant a
// fan-out (`tech-design`, one run per approved epic) collapsed three runs into one.
//
// TWO WAYS A WORKFLOW BECOMES VISIBLE TO A ROLE, and they use DIFFERENT ownership fields on purpose:
//
//   before it opens   the row that can open it — a work_task whose own step nests a workflow code,
//                      still idle. Visible to whoever that ROW's role_code names.
//   after it opens     the workflow_run itself, via its own owner_role_code (copied from the
//                      workflow's catalog row at open time by `open_workflow_run`).
//
// These are NOT always the same role. `sprint-0`'s `draft-features` row is assigned to
// `product-manager`, but the `feature` workflow it opens is owned by `product-owner` — the PM can
// click it, but the resulting run belongs on the PO's screen, not the PM's. Keying "available" off
// the clicking role and "open" off the run's own owner gets both right without special-casing it.
//
// SOME CATALOG WORKFLOWS ARE NEVER OPENED DIRECTLY — `product-brief`, `foundation-architecture` and
// others exist in `workflow` only because every imported workflow file becomes a catalog row
// (their labels literally read "Workflow: /product-brief", an unauthored stub). Listing those from
// the catalog independently of nesting would offer a SECOND way to open something that is only ever
// meant to be reached by clicking its nesting row — exactly the duplicate-entry confusion this was
// built to remove. So the catalog scan below only ever produces "available" for a code that is
// NEVER a `nests_workflow_code` anywhere in this org's workflow definitions.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./actor";
import { orgIdFor } from "./events";

export type WorkflowCard = {
  /** A run's id once open; the nesting task's own id before it is. Stable across a render either way. */
  key: string;
  code: string;
  label: string;
  state: "available" | "open" | "closed";
  /** The epic, story, or other backlog item this run is about — set only for a fan-out. */
  subject: string | null;
  runId: string | null;
  /** The row to click to open it — only set pre-open; the run itself has no single "task" once open. */
  taskId: string | null;
  closedCount: number;
  totalCount: number;
};

export async function workflowsFor(actor: Actor): Promise<WorkflowCard[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const orgId = await orgIdFor(actor.engagementId);

  // Every code this org's workflow definitions ever nest, anywhere — not just in a currently open
  // run. This is what tells a genuinely standalone phase (`sprint-0`, `onboarding`) apart from a
  // catalog stub that only exists because it was imported, never meant to be opened on its own.
  const { data: orgWorkflows } = await sb.from("workflow").select("id").eq("org_id", orgId);
  const { data: orgVersions } = orgWorkflows?.length
    ? await sb
        .from("workflow_version")
        .select("id")
        .in(
          "workflow_id",
          orgWorkflows.map((w) => w.id as string),
        )
    : { data: [] };
  const { data: allSteps } = orgVersions?.length
    ? await sb
        .from("workflow_step")
        .select("nests_workflow_code")
        .in(
          "workflow_version_id",
          orgVersions.map((v) => v.id as string),
        )
        .not("nests_workflow_code", "is", null)
    : { data: [] };
  const nestedCodesOrgWide = new Set((allSteps ?? []).map((s) => s.nests_workflow_code as string));

  // ── standalone workflows this role owns, catalog-only ────────────────────────────────────────
  const { data: catalogWfs } = await sb
    .from("workflow")
    .select("id, code, label, repeatable")
    .eq("org_id", orgId)
    .eq("owner_role_code", actor.roleCode)
    .eq("enabled", true);
  const standalone = (catalogWfs ?? []).filter((w) => !nestedCodesOrgWide.has(w.code as string));

  const { data: standaloneRuns } = standalone.length
    ? await sb
        .from("workflow_run")
        .select("id, workflow_id, state, opened_at")
        .eq("engagement_id", actor.engagementId)
        .in(
          "workflow_id",
          standalone.map((w) => w.id as string),
        )
        .is("parent_task_id", null)
        .order("opened_at", { ascending: false })
    : { data: [] };
  const latestByWorkflow = new Map<string, { id: string; state: string }>();
  for (const r of standaloneRuns ?? []) {
    if (!latestByWorkflow.has(r.workflow_id as string))
      latestByWorkflow.set(r.workflow_id as string, { id: r.id as string, state: r.state as string });
  }

  const cards: WorkflowCard[] = [];
  const countsByRun = new Map<string, { closed: number; total: number }>();

  async function countsFor(runIds: string[]) {
    if (!runIds.length || !sb) return;
    const { data: tasks } = await sb
      .from("work_task")
      .select("workflow_run_id, state")
      .in("workflow_run_id", runIds);
    for (const t of tasks ?? []) {
      const id = t.workflow_run_id as string;
      const c = countsByRun.get(id) ?? { closed: 0, total: 0 };
      c.total += 1;
      if (t.state === "closed") c.closed += 1;
      countsByRun.set(id, c);
    }
  }
  await countsFor((standaloneRuns ?? []).map((r) => r.id as string));

  for (const w of standalone) {
    const run = latestByWorkflow.get(w.id as string);
    const counts = run ? countsByRun.get(run.id) ?? { closed: 0, total: 0 } : { closed: 0, total: 0 };
    cards.push({
      key: run?.id ?? (w.id as string),
      code: w.code as string,
      label: w.label as string,
      state: run
        ? run.state === "closed"
          ? w.repeatable
            ? "available"
            : "closed"
          : "open"
        : "available",
      subject: null,
      runId: run?.id ?? null,
      taskId: null,
      closedCount: counts.closed,
      totalCount: counts.total,
    });
  }

  // ── open runs of a NESTED workflow this role owns — every one, not just the latest ───────────
  const { data: ownedRuns } = await sb
    .from("workflow_run")
    .select("id, workflow_id, state, subject_ref, opened_at, parent_task_id, workflow(code, label)")
    .eq("engagement_id", actor.engagementId)
    .eq("owner_role_code", actor.roleCode)
    .not("parent_task_id", "is", null)
    .order("opened_at", { ascending: false });

  await countsFor((ownedRuns ?? []).map((r) => r.id as string));

  const openedParentTaskIds = new Set<string>();
  for (const r of ownedRuns ?? []) {
    const wf = Array.isArray(r.workflow) ? r.workflow[0] : r.workflow;
    const counts = countsByRun.get(r.id as string) ?? { closed: 0, total: 0 };
    openedParentTaskIds.add(`${r.parent_task_id as string}:${r.subject_ref ?? ""}`);
    cards.push({
      key: r.id as string,
      code: (wf?.code as string) ?? "",
      label: r.subject_ref ? `${wf?.label ?? ""} — ${r.subject_ref}` : (wf?.label as string) ?? "",
      state: r.state === "closed" ? "closed" : "open",
      subject: (r.subject_ref as string | null) ?? null,
      runId: r.id as string,
      taskId: r.parent_task_id as string,
      closedCount: counts.closed,
      totalCount: counts.total,
    });
  }

  // ── rows this role could click to open a nested workflow, not yet clicked ─────────────────────
  const { data: nestingRows } = await sb
    .from("work_task")
    .select("id, title, state, workflow_step(nests_workflow_code)")
    .eq("engagement_id", actor.engagementId)
    .eq("role_code", actor.roleCode)
    .eq("state", "idle");

  for (const t of nestingRows ?? []) {
    const step = Array.isArray(t.workflow_step) ? t.workflow_step[0] : t.workflow_step;
    const code = step?.nests_workflow_code as string | null;
    if (!code) continue;
    // Already has an open run under this exact row (no subject — a manual click has none): the
    // open-run half above already carries it, so this would be a second card for the same thing.
    if (openedParentTaskIds.has(`${t.id}:`)) continue;
    cards.push({
      key: t.id as string,
      code,
      label: t.title as string,
      state: "available",
      subject: null,
      runId: null,
      taskId: t.id as string,
      closedCount: 0,
      totalCount: 0,
    });
  }

  return cards;
}
