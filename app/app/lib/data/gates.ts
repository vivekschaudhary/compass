// Evaluating gates — turning criteria into measurements.
//
// THREE STATES, NOT TWO. A criterion is satisfied, not satisfied, or NOT YET MEASURABLE, and the
// third is not a polite way of saying false. "The reviewer approved" before anyone has reviewed is
// unknown; treating it as false makes a queue look blocked, and treating it as true is the false
// green everything here is built against. Unknown is the absence of a measurement row.
//
// The split matters: this file knows HOW to evaluate — it can read documents, check connectors,
// and later ask Jira and GitHub. The DATABASE enforces that it was done, by refusing to start a
// task whose Ready criteria have no satisfied measurement. Neither half can be skipped.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./actor";

export type CriterionRow = {
  id: string;
  kind: "ready" | "done";
  stepOrd: number | null;
  statement: string;
  subjectKind: string | null;
  subjectRef: string | null;
  operator: string | null;
  value: string | null;
};

export type Verdict =
  | { state: "satisfied"; source: string; detail: string }
  | { state: "unsatisfied"; source: string; detail: string }
  /** Not a failure. Nothing has happened yet that could decide it. */
  | { state: "unmeasurable"; why: string };

export type CriterionStatus = CriterionRow & { verdict: Verdict };

/* ── the evaluators ──────────────────────────────────────────────────────── */

async function evaluateDocument(actor: Actor, c: CriterionRow): Promise<Verdict> {
  const sb = supabaseAdmin();
  if (!sb) return { state: "unmeasurable", why: "no database" };

  const { data: doc } = await sb.from("document")
    .select("id, current_version_id")
    .eq("engagement_id", actor.engagementId).eq("path", c.subjectRef!).maybeSingle();

  if (!doc) {
    // A document that does not exist is genuinely not satisfied — this is a real answer, not a
    // missing one. The path was declared and nothing is there.
    return { state: "unsatisfied", source: "compass", detail: `No document at ${c.subjectRef}.` };
  }
  if (!doc.current_version_id) {
    return { state: "unsatisfied", source: "compass", detail: `${c.subjectRef} exists but has never been drafted.` };
  }

  const { data: v } = await sb.from("document_version")
    .select("version, status").eq("id", doc.current_version_id).maybeSingle();

  const ok = v?.status === c.value;
  return ok
    ? { state: "satisfied", source: "compass", detail: `${c.subjectRef} is ${v!.status} at v${v!.version}.` }
    : { state: "unsatisfied", source: "compass", detail: `${c.subjectRef} is ${v?.status ?? "unknown"}, not ${c.value}.` };
}

async function evaluateConnector(actor: Actor, c: CriterionRow): Promise<Verdict> {
  const sb = supabaseAdmin();
  if (!sb) return { state: "unmeasurable", why: "no database" };

  const { data: e } = await sb.from("engagement")
    .select("docs_provider, confluence_space, confluence_root_page_id, teams_site, jira_project, jira_board_id")
    .eq("id", actor.engagementId).maybeSingle();
  if (!e) return { state: "unmeasurable", why: "engagement not found" };

  // "Wired" means configured here. It does NOT mean the API answered — that is a stronger claim
  // and it needs a live call. When intake's readiness check moves over, this becomes that.
  if (c.subjectRef === "docs") {
    const wired = e.docs_provider === "teams"
      ? Boolean(e.teams_site)
      : Boolean(e.confluence_space && e.confluence_root_page_id);
    return wired
      ? { state: "satisfied", source: "compass", detail: `Documentation is configured (${e.docs_provider}).` }
      : { state: "unsatisfied", source: "compass", detail: `${e.docs_provider ?? "Documentation"} is chosen but not configured — no space or root page.` };
  }
  if (c.subjectRef === "tickets") {
    return e.jira_project
      ? { state: "satisfied", source: "compass", detail: `Tracker is configured (${e.jira_project}).` }
      : { state: "unsatisfied", source: "compass", detail: "No tracker project is configured for this engagement." };
  }
  return { state: "unmeasurable", why: `no evaluator for connector '${c.subjectRef}'` };
}

/**
 * Evaluate one criterion.
 *
 * Anything without an evaluator is UNMEASURABLE, and says which subject it needed. That list is
 * itself useful: it is exactly what has to be wired next for a gate to stop being decorative.
 */
export async function evaluate(actor: Actor, c: CriterionRow): Promise<Verdict> {
  if (!c.subjectKind) {
    return { state: "unmeasurable", why: "judgment — a person decides this one" };
  }
  switch (c.subjectKind) {
    case "document": return evaluateDocument(actor, c);
    case "connector": return evaluateConnector(actor, c);
    case "ticket": return { state: "unmeasurable", why: "the tracker mirror is not wired yet" };
    case "backlog": return { state: "unmeasurable", why: "nothing has been drafted to check" };
    case "roster": return { state: "unmeasurable", why: "no roster evaluator yet" };
    default: return { state: "unmeasurable", why: `no evaluator for '${c.subjectKind}'` };
  }
}

/* ── reading the criteria that apply to a task ───────────────────────────── */

/**
 * A task's criteria: its own step's, plus the workflow-level ones.
 *
 * Workflow-level criteria (step_ord null) are about the run as a whole and are shown separately —
 * a task card lists what that task must satisfy, never someone else's step. But the READY gate on
 * the workflow does apply before the first task may start, which is why they are returned together
 * and labelled rather than merged.
 */
export async function criteriaForTask(taskId: string): Promise<CriterionRow[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: task } = await sb.from("work_task")
    .select("workflow_step_id, workflow_run(workflow_version_id)")
    .eq("id", taskId).maybeSingle();
  if (!task) return [];

  const run = task.workflow_run as unknown as { workflow_version_id: string } | { workflow_version_id: string }[] | null;
  const versionId = Array.isArray(run) ? run[0]?.workflow_version_id : run?.workflow_version_id;
  if (!versionId) return [];

  let stepOrd: number | null = null;
  if (task.workflow_step_id) {
    const { data: step } = await sb.from("workflow_step").select("ord").eq("id", task.workflow_step_id).maybeSingle();
    stepOrd = step?.ord ?? null;
  }

  const { data } = await sb.from("criterion")
    .select("id, kind, step_ord, statement, subject_kind, subject_ref, operator, value")
    .eq("workflow_version_id", versionId).order("ord");

  return (data ?? [])
    .filter((c) => c.step_ord === null || c.step_ord === stepOrd)
    .map((c) => ({
      id: c.id, kind: c.kind, stepOrd: c.step_ord, statement: c.statement,
      subjectKind: c.subject_kind, subjectRef: c.subject_ref, operator: c.operator, value: c.value,
    }));
}

/**
 * Evaluate every criterion for a task and RECORD the results.
 *
 * Measurements are written, not just returned — `measured_at` and `source` on a row are what make
 * "3 of 4" evidence rather than a claim, and what let the card say "as of four minutes ago"
 * instead of implying live truth. Unmeasurable criteria write nothing: the absence of a row IS
 * the unknown.
 */
export async function measureTask(actor: Actor, taskId: string): Promise<CriterionStatus[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const criteria = await criteriaForTask(taskId);
  const out: CriterionStatus[] = [];

  for (const c of criteria) {
    const verdict = await evaluate(actor, c);
    out.push({ ...c, verdict });

    if (verdict.state === "unmeasurable") {
      // Clear any stale measurement rather than leaving yesterday's answer standing.
      await sb.from("measurement").delete().eq("task_id", taskId).eq("criterion_id", c.id);
      continue;
    }
    await sb.from("measurement").upsert({
      task_id: taskId, criterion_id: c.id,
      satisfied: verdict.state === "satisfied",
      measured_at: new Date().toISOString(),
      source: verdict.source, detail: verdict.detail,
    }, { onConflict: "task_id,criterion_id" });
  }

  return out;
}

/** Ready / Done, counted honestly. */
export function tally(statuses: CriterionStatus[], kind: "ready" | "done") {
  const mine = statuses.filter((s) => s.kind === kind);
  return {
    total: mine.length,
    satisfied: mine.filter((s) => s.verdict.state === "satisfied").length,
    unsatisfied: mine.filter((s) => s.verdict.state === "unsatisfied").length,
    unmeasurable: mine.filter((s) => s.verdict.state === "unmeasurable").length,
    /** Only true when every one of them was actually checked and passed. */
    passes: mine.length > 0 && mine.every((s) => s.verdict.state === "satisfied"),
  };
}

/* ── reading what was already measured ───────────────────────────────────── */

export type StoredStatus = CriterionRow & {
  satisfied: boolean | null;          // null = never checked
  measuredAt: string | null;
  source: string | null;
  detail: string | null;
};

/**
 * Criteria plus whatever was last measured, for DISPLAY.
 *
 * Deliberately read-only. Evaluating writes measurement rows, and a page render should not write —
 * quite apart from the impoliteness, it would make every refresh look like fresh evidence when
 * nothing had been re-checked. The button re-checks; the page shows what is on the record and when
 * it was put there.
 *
 * Batched across tasks: a card list would otherwise be two queries per card.
 */
export async function storedStatusFor(taskIds: string[]): Promise<Map<string, StoredStatus[]>> {
  const out = new Map<string, StoredStatus[]>();
  const sb = supabaseAdmin();
  if (!sb || taskIds.length === 0) return out;

  const { data: tasks } = await sb.from("work_task")
    .select("id, workflow_step_id, workflow_run(workflow_version_id)").in("id", taskIds);

  const { data: steps } = await sb.from("workflow_step").select("id, ord");
  const ordOf = new Map((steps ?? []).map((s) => [s.id, s.ord as number]));

  const versionIds = [...new Set((tasks ?? []).map((t) => {
    const r = t.workflow_run as unknown as { workflow_version_id: string } | { workflow_version_id: string }[] | null;
    return Array.isArray(r) ? r[0]?.workflow_version_id : r?.workflow_version_id;
  }).filter(Boolean))] as string[];

  const { data: criteria } = versionIds.length
    ? await sb.from("criterion")
        .select("id, workflow_version_id, kind, step_ord, statement, subject_kind, subject_ref, operator, value, ord")
        .in("workflow_version_id", versionIds).order("ord")
    : { data: [] };

  const { data: measurements } = await sb.from("measurement")
    .select("task_id, criterion_id, satisfied, measured_at, source, detail").in("task_id", taskIds);
  const key = (t: string, c: string) => `${t}:${c}`;
  const measured = new Map((measurements ?? []).map((m) => [key(m.task_id, m.criterion_id), m]));

  for (const t of tasks ?? []) {
    const r = t.workflow_run as unknown as { workflow_version_id: string } | { workflow_version_id: string }[] | null;
    const versionId = Array.isArray(r) ? r[0]?.workflow_version_id : r?.workflow_version_id;
    const stepOrd = t.workflow_step_id ? ordOf.get(t.workflow_step_id) ?? null : null;

    const mine = (criteria ?? [])
      .filter((c) => c.workflow_version_id === versionId)
      .filter((c) => c.step_ord === null || c.step_ord === stepOrd)
      .map((c): StoredStatus => {
        const m = measured.get(key(t.id, c.id));
        return {
          id: c.id, kind: c.kind, stepOrd: c.step_ord, statement: c.statement,
          subjectKind: c.subject_kind, subjectRef: c.subject_ref, operator: c.operator, value: c.value,
          satisfied: m ? m.satisfied : null,
          measuredAt: m?.measured_at ?? null, source: m?.source ?? null, detail: m?.detail ?? null,
        };
      });

    out.set(t.id, mine);
  }
  return out;
}

/** How a criterion reads on a card when it has no statement of its own. */
export function describeCriterion(c: CriterionRow): string {
  if (c.statement) return c.statement;
  if (c.subjectKind) return `${c.subjectKind} ${c.subjectRef} ${c.operator} ${c.value}`;
  return "unnamed criterion";
}
