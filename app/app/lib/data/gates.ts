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
import { probeDocs, type DocEng } from "../docstore";
import { resolveJira, projectStatuses } from "../jira";
import type { Actor } from "./actor";
export { describeCriterion } from "@/app/v2/_ui/criterion";

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

/**
 * Is the connector actually reachable?
 *
 * This used to read the engagement's own settings back and call a non-empty field "wired". That is
 * a check of what somebody typed, not of what works — and it passed for weeks on an engagement
 * whose documents were being published nowhere, because nothing had ever tried.
 *
 * Now it calls the API. `probeDocs` asks the provider for the space; `projectStatuses` asks Jira
 * for the project. Both fail with a reason, and the reason is what lands on the card — "space
 * Test not found" sends someone somewhere useful in a way that "not configured" never did.
 *
 * The cost is that a gate check now makes a network call and can be slow or flaky. That is the
 * correct trade: a fast check that cannot fail is not a check.
 */
async function evaluateConnector(actor: Actor, c: CriterionRow): Promise<Verdict> {
  const sb = supabaseAdmin();
  if (!sb) return { state: "unmeasurable", why: "no database" };

  const { data: e } = await sb.from("engagement")
    .select("id, name, docs_provider, confluence_space, confluence_root_page_id, atlassian_base_url, atlassian_email, atlassian_api_token, teams_site, teams_root_item_id, graph_tenant_id, graph_client_id, graph_client_secret, jira_project, jira_board_id")
    .eq("id", actor.engagementId).maybeSingle();
  if (!e) return { state: "unmeasurable", why: "engagement not found" };

  if (c.subjectRef === "docs") {
    let problem: string | null;
    try {
      problem = await probeDocs(e as DocEng);
    } catch (err) {
      // A network failure is not the same as a misconfigured space, and saying "not configured"
      // when the truth is "the office wifi dropped" sends someone to change settings that are fine.
      return { state: "unmeasurable", why: `could not reach ${e.docs_provider ?? "the doc store"}: ${err instanceof Error ? err.message : String(err)}` };
    }
    return problem === null
      ? { state: "satisfied", source: e.docs_provider ?? "docs", detail: `${e.docs_provider === "teams" ? "Teams site" : `Confluence space ${e.confluence_space}`} answered.` }
      : { state: "unsatisfied", source: e.docs_provider ?? "docs", detail: problem };
  }

  if (c.subjectRef === "tickets") {
    if (!e.jira_project) {
      return { state: "unsatisfied", source: "compass", detail: "No tracker project is configured for this engagement." };
    }
    const creds = resolveJira(e as Parameters<typeof resolveJira>[0]);
    if (!creds) {
      return { state: "unsatisfied", source: "compass", detail: "No Jira credentials (base url / email / token)." };
    }
    let statuses: string[] | null;
    try {
      statuses = await projectStatuses(creds);
    } catch (err) {
      return { state: "unmeasurable", why: `could not reach Jira: ${err instanceof Error ? err.message : String(err)}` };
    }
    return statuses
      ? { state: "satisfied", source: "jira", detail: `Project ${e.jira_project} answered with ${statuses.length} statuses.` }
      : { state: "unsatisfied", source: "jira", detail: `Jira did not return project ${e.jira_project} — check the key and the credentials' access to it.` };
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


/* ── approving: a person as the evaluator ────────────────────────────────── */

/**
 * Record a person confirming Done criteria, then close the task.
 *
 * Judgment criteria — "scope not covered by any row is named rather than left implicit" — cannot be
 * computed. The person who knows the engagement reads the draft and says so, and that attestation
 * is stored as a measurement with `source: "human"` and their name, exactly like a machine check.
 * The record does not distinguish "a script verified this" from "Matt said so" by making one of
 * them less real; it distinguishes them by saying which.
 *
 * Per-criterion rather than one button, because a single Approve that silently satisfies five
 * criteria is a signature on work nobody read. Criteria left unconfirmed stay unmeasured, and the
 * database refuses the close — the person does not have to remember what they skipped.
 */
export async function approve(
  actor: Actor, taskId: string, confirmed: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const { data: task } = await sb.from("work_task")
    .select("id").eq("id", taskId).eq("engagement_id", actor.engagementId).maybeSingle();
  if (!task) return { ok: false, error: "That task is not in your engagement." };

  const who = actor.holder ?? actor.roleCode;
  const criteria = await criteriaForTask(taskId);
  const done = criteria.filter((c) => c.kind === "done");

  for (const c of done) {
    if (!confirmed.includes(c.id)) {
      // Not confirmed is not "failed" — it is unmeasured, and the gate treats it as such. Writing
      // satisfied:false here would say the person checked and rejected it, which they did not.
      await sb.from("measurement").delete().eq("task_id", taskId).eq("criterion_id", c.id);
      continue;
    }
    await sb.from("measurement").upsert({
      task_id: taskId, criterion_id: c.id, satisfied: true,
      measured_at: new Date().toISOString(),
      source: "human", detail: `Confirmed by ${who}.`,
    }, { onConflict: "task_id,criterion_id" });
  }

  const { error } = await sb.rpc("close_task", {
    p_task_id: taskId, p_actor: who, p_actor_role: actor.roleCode,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Send the draft back: record what a reviewer read and refused, and why.
 *
 * The counterpart to `approve`. An unticked criterion is unmeasured — nobody looked. A REJECTED
 * one is someone reading the work and saying what is wrong with it, stored as `satisfied: false`
 * with their name and their reason, and read back to the agent on its next run.
 *
 * Without this the gate could only stall. A reviewer who found a real problem had no way to say so
 * except by leaving a box unticked, which is indistinguishable from not having got to it.
 */
export async function reject(
  actor: Actor, taskId: string, rejections: { criterionId: string; reason: string }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const { data: task } = await sb.from("work_task")
    .select("id, state").eq("id", taskId).eq("engagement_id", actor.engagementId).maybeSingle();
  if (!task) return { ok: false, error: "That task is not in your engagement." };

  const given = rejections.filter((r) => r.reason.trim().length > 0);
  if (!given.length) {
    // A rejection with no reason is not a rejection, it is a refusal to explain. The agent cannot
    // act on it and the next reviewer cannot tell what was wrong.
    return { ok: false, error: "A rejection needs a reason — the agent has to act on it." };
  }

  const who = actor.holder ?? actor.roleCode;
  for (const r of given) {
    await sb.from("measurement").upsert({
      task_id: taskId, criterion_id: r.criterionId, satisfied: false,
      measured_at: new Date().toISOString(),
      source: "human", detail: `Rejected by ${who}: ${r.reason.trim()}`,
    }, { onConflict: "task_id,criterion_id" });
  }

  // Back to running: there is work to do, and it is the agent's. Leaving it at `hitl` would say
  // it is still waiting on a human when the human has just answered.
  await sb.from("work_task").update({ state: "running" }).eq("id", taskId);

  const { data: last } = await sb.from("turn").select("ord").eq("task_id", taskId)
    .order("ord", { ascending: false }).limit(1);
  await sb.from("turn").insert({
    task_id: taskId, ord: (last?.[0]?.ord ?? -1) + 1,
    author_kind: "human", author_role_code: actor.roleCode, author_user_id: who,
    body: `Sent back for revision:\n\n${given.map((r) => `- ${r.reason.trim()}`).join("\n")}`,
  });

  return { ok: true };
}

/**
 * Check the engagement's connectors right now, without a task.
 *
 * The same evaluators the gate uses, callable on their own — for a setup screen, and for answering
 * "can Compass actually reach Confluence" without having to find a task whose gate happens to ask.
 */
export async function checkConnectors(actor: Actor): Promise<{ connector: string; verdict: Verdict }[]> {
  const shape = (ref: string): CriterionRow => ({
    id: "", kind: "ready", stepOrd: null, statement: "",
    subjectKind: "connector", subjectRef: ref, operator: "is", value: "wired",
  });
  return Promise.all(
    ["docs", "tickets"].map(async (connector) => ({ connector, verdict: await evaluate(actor, shape(connector)) })),
  );
}
