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
import { supabaseAdmin, must } from "../supabase";
import { emit, emitRefusal } from "./events";
import { expandLinks } from "./links";
import { mirrorState, moveFailed } from "./tracker";
import { materialiseFrom } from "./materialise";
import { probeDocs, type DocEng } from "../docstore";
import { resolvePath } from "../adapters";
import { subjectOfRun } from "../agent/context";
import {
  resolveJira,
  projectStatuses,
  searchIssues,
  remoteLinks,
  issueStatus,
} from "../jira";
import { sprintJql, sprintNoOf } from "./sprint";
import type { Actor } from "./actor";
export { describeCriterion } from "@/app/_ui/criterion";

export type CriterionRow = {
  id: string;
  kind: "ready" | "done";
  /** The task slug of the step this criterion belongs to; null means the workflow as a whole. */
  stepTask: string | null;
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

async function evaluateDocument(
  actor: Actor,
  c: CriterionRow,
  taskId: string | null,
): Promise<Verdict> {
  const sb = supabaseAdmin();
  if (!sb) return { state: "unmeasurable", why: "no database" };

  // A criterion may name its subject (`03-architecture/epic/{epic}`) — the same path the step
  // produces, and it has to resolve the same way here or the gate would measure a document nobody
  // filed while the real one sits published at the resolved path.
  //
  // UNMEASURABLE, NOT UNSATISFIED, when it cannot be filled. "No document at
  // 03-architecture/epic/{epic}" is not a fact about the work — it is this evaluator saying it did
  // not know where to look, and dressing that up as a failed check would blame the author for a
  // run that was opened wrong. Unmeasurable writes no measurement, so the close is still refused.
  let path = c.subjectRef;
  if (path?.includes("{")) {
    const subject = taskId ? await subjectFor(taskId) : null;
    path = resolvePath(c.subjectRef, subject);
    if (!path) {
      return {
        state: "unmeasurable",
        why: `${c.subjectRef} names a subject this run does not have`,
      };
    }
  }

  const { data: doc } = await sb
    .from("document")
    .select("id, current_version_id")
    .eq("engagement_id", actor.engagementId)
    .eq("path", path!)
    .maybeSingle();

  if (!doc) {
    // A document that does not exist is genuinely not satisfied — this is a real answer, not a
    // missing one. The path was declared and nothing is there.
    return {
      state: "unsatisfied",
      source: "compass",
      detail: `No document at ${path}.`,
    };
  }
  if (!doc.current_version_id) {
    return {
      state: "unsatisfied",
      source: "compass",
      detail: `${path} exists but has never been drafted.`,
    };
  }

  const { data: v } = await sb
    .from("document_version")
    .select("version, status")
    .eq("id", doc.current_version_id)
    .maybeSingle();

  const ok = v?.status === c.value;
  return ok
    ? {
        state: "satisfied",
        source: "compass",
        detail: `${path} is ${v!.status} at v${v!.version}.`,
      }
    : {
        state: "unsatisfied",
        source: "compass",
        detail: `${path} is ${v?.status ?? "unknown"}, not ${c.value}.`,
      };
}

/** The subject of the run a task belongs to — what fills `{epic}` in that task's paths. */
async function subjectFor(
  taskId: string,
): Promise<{ ref: string | null; key: string | null } | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data: task } = await sb
    .from("work_task")
    .select("workflow_run_id")
    .eq("id", taskId)
    .maybeSingle();
  return subjectOfRun((task?.workflow_run_id as string | null) ?? null);
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
async function evaluateConnector(
  actor: Actor,
  c: CriterionRow,
): Promise<Verdict> {
  const sb = supabaseAdmin();
  if (!sb) return { state: "unmeasurable", why: "no database" };

  const { data: e } = await sb
    .from("engagement")
    .select(
      "id, name, docs_provider, confluence_space, confluence_root_page_id, atlassian_base_url, atlassian_email, atlassian_api_token, teams_site, teams_root_item_id, graph_tenant_id, graph_client_id, graph_client_secret, jira_project, jira_board_id",
    )
    .eq("id", actor.engagementId)
    .maybeSingle();
  if (!e) return { state: "unmeasurable", why: "engagement not found" };

  if (c.subjectRef === "docs") {
    let problem: string | null;
    try {
      problem = await probeDocs(e as DocEng);
    } catch (err) {
      // A network failure is not the same as a misconfigured space, and saying "not configured"
      // when the truth is "the office wifi dropped" sends someone to change settings that are fine.
      return {
        state: "unmeasurable",
        why: `could not reach ${e.docs_provider ?? "the doc store"}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    return problem === null
      ? {
          state: "satisfied",
          source: e.docs_provider ?? "docs",
          detail: `${e.docs_provider === "teams" ? "Teams site" : `Confluence space ${e.confluence_space}`} answered.`,
        }
      : {
          state: "unsatisfied",
          source: e.docs_provider ?? "docs",
          detail: problem,
        };
  }

  if (c.subjectRef === "tickets") {
    if (!e.jira_project) {
      return {
        state: "unsatisfied",
        source: "compass",
        detail: "No tracker project is configured for this engagement.",
      };
    }
    const creds = resolveJira(e as Parameters<typeof resolveJira>[0]);
    if (!creds) {
      return {
        state: "unsatisfied",
        source: "compass",
        detail: "No Jira credentials (base url / email / token).",
      };
    }
    let statuses: string[] | null;
    try {
      statuses = await projectStatuses(creds);
    } catch (err) {
      return {
        state: "unmeasurable",
        why: `could not reach Jira: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    return statuses
      ? {
          state: "satisfied",
          source: "jira",
          detail: `Project ${e.jira_project} answered with ${statuses.length} statuses.`,
        }
      : {
          state: "unsatisfied",
          source: "jira",
          detail: `Jira did not return project ${e.jira_project} — check the key and the credentials' access to it.`,
        };
  }

  return {
    state: "unmeasurable",
    why: `no evaluator for connector '${c.subjectRef}'`,
  };
}

/**
 * Check a drafted backlog against the catalogue.
 *
 * These three criteria — every row names a workflow that exists, a role that exists, and sits in a
 * known stage — were being asked of a HUMAN, with a tick box, because the evaluator returned
 * "nothing has been drafted to check". That was true when it was written and stopped being true
 * the moment a draft existed. Asking a person to verify eighteen rows against a catalogue is
 * asking them to do arithmetic and calling it judgment: they will tick it, and the tick will mean
 * nothing.
 *
 * The parse is deliberately conservative. It looks for a markdown table with a workflow column and
 * a role column; if it cannot find one, it returns UNMEASURABLE rather than passing. A parser that
 * silently finds nothing and reports success is worse than no parser at all.
 */
async function evaluateBacklog(
  actor: Actor,
  c: CriterionRow,
  taskId: string | null,
): Promise<Verdict> {
  const sb = supabaseAdmin();
  if (!sb || !taskId)
    return { state: "unmeasurable", why: "no task to read a draft from" };

  const { data: task } = await sb
    .from("work_task")
    .select("workflow_step_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task?.workflow_step_id)
    return {
      state: "unmeasurable",
      why: "this task produces nothing to check",
    };

  const { data: step } = await sb
    .from("workflow_step")
    .select("produces")
    .eq("id", task.workflow_step_id)
    .maybeSingle();
  if (!step?.produces)
    return {
      state: "unmeasurable",
      why: "this task's step declares no document",
    };

  const { data: doc } = await sb
    .from("document")
    .select("current_version_id")
    .eq("engagement_id", actor.engagementId)
    .eq("path", step.produces)
    .maybeSingle();
  if (!doc?.current_version_id)
    return { state: "unmeasurable", why: "nothing has been drafted yet" };

  const { data: sections } = await sb
    .from("document_section")
    .select("heading, body")
    .eq("document_version_id", doc.current_version_id)
    .order("ord");
  if (!sections?.length)
    return { state: "unmeasurable", why: "the draft has no sections" };

  // What actually exists, to check the rows against.
  const { data: wfs } = await sb
    .from("workflow")
    .select("code")
    .eq("org_id", actor.orgId);
  const { data: roles } = await sb
    .from("role")
    .select("code")
    .eq("org_id", actor.orgId);
  const knownWorkflows = new Set((wfs ?? []).map((w) => w.code as string));
  const knownRoles = new Set((roles ?? []).map((r) => r.code as string));

  type Row = { workflow: string | null; role: string | null; stage: string };
  const rows: Row[] = [];

  for (const sec of sections) {
    const lines = sec.body.split("\n");
    let cols: string[] | null = null;
    for (const line of lines) {
      if (!line.trim().startsWith("|")) {
        cols = null;
        continue;
      }
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((x: string) => x.trim());
      if (/^[\s|:-]+$/.test(line)) continue; // the ---|--- rule
      if (!cols) {
        cols = cells.map((x: string) => x.toLowerCase());
        continue;
      } // header

      // A backlog table has BOTH a workflow column and a role column. The roster and the approval
      // block also have a role column, and matching on "either" pulled their rows in as backlog
      // rows with no workflow — 28 rows where there were 17, and two criteria failing on tables
      // that were never rows. Requiring both is the discriminator.
      const wfIdx = cols.findIndex((h) => /workflow/.test(h));
      const roleIdx = cols.findIndex((h) => /role|owner/.test(h));
      if (wfIdx < 0 || roleIdx < 0) continue;

      const wfCell = cells[wfIdx] ?? "";
      const roleCell = cells[roleIdx] ?? "";

      rows.push({
        // `\`plan-kickoff\` (1 step)` or `create-epics — **STEPS UNSPECIFIED**`
        workflow:
          (wfCell.match(/`([a-z0-9-]+)`/) ??
            wfCell.match(/^([a-z0-9-]+)/))?.[1] ?? null,
        // `delivery-manager — John`
        role: (roleCell.match(/^\**([a-z-]+)/) ?? [])[1] ?? null,
        stage: sec.heading,
      });
    }
  }

  if (!rows.length) {
    return {
      state: "unmeasurable",
      why: "no table with a workflow and role column was found in the draft",
    };
  }

  if (c.subjectRef === "workflow") {
    const bad = rows.filter(
      (r) => !r.workflow || !knownWorkflows.has(r.workflow),
    );
    return bad.length === 0
      ? {
          state: "satisfied",
          source: "compass",
          detail: `All ${rows.length} rows name a workflow that exists.`,
        }
      : {
          state: "unsatisfied",
          source: "compass",
          detail: `${bad.length} of ${rows.length} rows name no known workflow: ${[...new Set(bad.map((b) => b.workflow ?? "(blank)"))].join(", ")}.`,
        };
  }

  if (c.subjectRef === "owner") {
    const bad = rows.filter((r) => !r.role || !knownRoles.has(r.role));
    return bad.length === 0
      ? {
          state: "satisfied",
          source: "compass",
          detail: `All ${rows.length} rows name a role that exists.`,
        }
      : {
          state: "unsatisfied",
          source: "compass",
          detail: `${bad.length} of ${rows.length} rows name no known role: ${[...new Set(bad.map((b) => b.role ?? "(blank)"))].join(", ")}.`,
        };
  }

  if (c.subjectRef === "stage") {
    const staged = /pre-?sprint\s*0|sprint\s*0/i;
    const bad = rows.filter((r) => !staged.test(r.stage));
    return bad.length === 0
      ? {
          state: "satisfied",
          source: "compass",
          detail: `All ${rows.length} rows sit under a Pre-Sprint 0 or Sprint 0 heading.`,
        }
      : {
          state: "unsatisfied",
          source: "compass",
          detail: `${bad.length} rows are under headings that name neither stage: ${[...new Set(bad.map((b) => b.stage))].join("; ")}.`,
        };
  }

  // "Uncovered scope is named" is deliberately NOT computed. A section that exists and says
  // "nothing uncovered" would pass a presence check while being false, and only someone who knows
  // the engagement can tell. That one stays a person's to confirm.
  return {
    state: "unmeasurable",
    why: `judgment — a person decides '${c.subjectRef}'`,
  };
}

/**
 * Evaluate one criterion.
 *
 * Anything without an evaluator is UNMEASURABLE, and says which subject it needed. That list is
 * itself useful: it is exactly what has to be wired next for a gate to stop being decorative.
 */
export async function evaluate(
  actor: Actor,
  c: CriterionRow,
  taskId: string | null = null,
): Promise<Verdict> {
  if (!c.subjectKind) {
    return {
      state: "unmeasurable",
      why: "judgment — a person decides this one",
    };
  }
  switch (c.subjectKind) {
    case "document":
      return evaluateDocument(actor, c, taskId);
    case "connector":
      return evaluateConnector(actor, c);
    case "ticket":
      return evaluateTicket(actor, c, taskId);
    case "backlog":
      return evaluateBacklog(actor, c, taskId);
    case "nested":
      return evaluateNested(c, taskId);
    case "roster":
      return { state: "unmeasurable", why: "no roster evaluator yet" };
    default:
      return {
        state: "unmeasurable",
        why: `no evaluator for '${c.subjectKind}'`,
      };
  }
}

/**
 * Every child run this row opened has closed.
 *
 * The check a per-document criterion cannot make. `openNestedFanOut` opens one child run per epic
 * against ONE parent task, and `close_parent_task_when_child_run_closes` fires as each of them
 * closes — so a row with no gate closed on the FIRST epic and left the others running behind a row
 * the plan already counted as done. With this criterion `close_task` refuses until the last one is
 * in, and the trigger's exception path leaves the parent honestly open in the meantime.
 *
 * UNMEASURABLE when no child run exists, never satisfied. "All of nothing has closed" is true and
 * useless — it is the aggregate-over-zero-rows trap, and it would let the row close before anyone
 * pressed Start.
 */
async function evaluateNested(
  c: CriterionRow,
  taskId: string | null,
): Promise<Verdict> {
  if (!taskId)
    return {
      state: "unmeasurable",
      why: "not a row of a run, so nothing nests under it",
    };
  const sb = supabaseAdmin();
  if (!sb) return { state: "unmeasurable", why: "no database" };

  const runs = must(
    "read nested runs",
    await sb.from("workflow_run").select("state").eq("parent_task_id", taskId),
  );
  if (!runs?.length) {
    return {
      state: "unmeasurable",
      why: `no ${c.subjectRef ?? "nested"} run has been opened yet`,
    };
  }

  const open = runs.filter((r) => r.state !== "closed").length;
  const what = c.subjectRef ?? "nested";
  return open === 0
    ? {
        state: "satisfied",
        source: "compass",
        detail: `All ${runs.length} ${what} run(s) closed.`,
      }
    : {
        state: "unsatisfied",
        source: "compass",
        detail: `${open} of ${runs.length} ${what} run(s) still open.`,
      };
}

/**
 * A criterion about the ONE story a run is the subject of.
 *
 * `pr-linked` is the build's real bar and it is deliberately indirect: the orchestrator opens a
 * pull request ONLY when the project's CI-parity checks pass, so a linked pull request is evidence
 * the checks ran and were green. Asking Jira what is on the issue rather than trusting the write
 * that put it there — a gate that reads back its own call is measuring itself.
 */
async function evaluateStoryTicket(
  actor: Actor,
  c: CriterionRow,
  taskId: string,
): Promise<Verdict> {
  const sb = supabaseAdmin();
  if (!sb) return { state: "unmeasurable", why: "no database" };

  const { data: task } = await sb
    .from("work_task")
    .select("workflow_run_id")
    .eq("id", taskId)
    .maybeSingle();
  const { data: run } = task?.workflow_run_id
    ? await sb
        .from("workflow_run")
        .select("subject_key")
        .eq("id", task.workflow_run_id)
        .maybeSingle()
    : { data: null };
  const key = (run?.subject_key as string | null) ?? null;
  if (!key) {
    // Not unsatisfied: a run with no story is misconfigured, not a build that failed. Blaming the
    // engineer for it would send someone to read a diff that was never produced.
    return {
      state: "unmeasurable",
      why: "this run has no story on the tracker to read",
    };
  }

  const { data: eng } = await sb
    .from("engagement")
    .select(
      "jira_project, atlassian_base_url, atlassian_email, atlassian_api_token",
    )
    .eq("id", actor.engagementId)
    .maybeSingle();
  const creds = eng ? resolveJira(eng) : null;
  if (!creds)
    return {
      state: "unmeasurable",
      why: "no Jira is configured for this engagement",
    };

  if (c.subjectRef === "pr-linked") {
    const links = await remoteLinks(creds, key);
    // Null is "could not look", which is not "found none". Collapsing them would report a missing
    // pull request during an outage.
    if (links === null)
      return { state: "unmeasurable", why: `${key} could not be read` };
    const prs = links.filter((l) => /\/pull\/\d+/.test(l.url));
    return prs.length
      ? {
          state: "satisfied",
          source: "tracker",
          detail: `${key} links ${prs.length} pull request(s): ${prs.map((p) => p.url).join(", ")}.`,
        }
      : {
          state: "unsatisfied",
          source: "tracker",
          detail: `${key} has no pull request linked — nothing shipped.`,
        };
  }

  const status = await issueStatus(creds, key);
  if (status === null)
    return { state: "unmeasurable", why: `${key} could not be read` };
  const want = (c.value ?? "Done").toLowerCase();
  return status.toLowerCase() === want
    ? { state: "satisfied", source: "tracker", detail: `${key} is ${status}.` }
    : {
        state: "unsatisfied",
        source: "tracker",
        detail: `${key} is ${status}, not ${c.value ?? "Done"}.`,
      };
}

/* ── reading the criteria that apply to a task ───────────────────────────── */

/**
 * A task's criteria: its own step's, plus the workflow-level ones.
 *
 * Workflow-level criteria (step_task null) are about the run as a whole and are shown separately —
 * a task card lists what that task must satisfy, never someone else's step. But the READY gate on
 * the workflow does apply before the first task may start, which is why they are returned together
 * and labelled rather than merged.
 */
export async function criteriaForTask(taskId: string): Promise<CriterionRow[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: task } = await sb
    .from("work_task")
    .select(
      "workflow_step_id, workflow_run!work_task_workflow_run_id_fkey(workflow_version_id)",
    )
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return [];

  const run = task.workflow_run as unknown as
    | { workflow_version_id: string }
    | { workflow_version_id: string }[]
    | null;
  const versionId = Array.isArray(run)
    ? run[0]?.workflow_version_id
    : run?.workflow_version_id;
  if (!versionId) return [];

  let stepTask: string | null = null;
  if (task.workflow_step_id) {
    const { data: step } = await sb
      .from("workflow_step")
      .select("task")
      .eq("id", task.workflow_step_id)
      .maybeSingle();
    stepTask = step?.task ?? null;
  }

  const { data } = await sb
    .from("criterion")
    .select(
      "id, kind, step_task, statement, subject_kind, subject_ref, operator, value",
    )
    .eq("workflow_version_id", versionId)
    .order("ord");

  return (data ?? [])
    .filter((c) => c.step_task === null || c.step_task === stepTask)
    .map((c) => ({
      id: c.id,
      kind: c.kind,
      stepTask: c.step_task,
      statement: c.statement,
      subjectKind: c.subject_kind,
      subjectRef: c.subject_ref,
      operator: c.operator,
      value: c.value,
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
export async function measureTask(
  actor: Actor,
  taskId: string,
): Promise<CriterionStatus[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const criteria = await criteriaForTask(taskId);
  const out: CriterionStatus[] = [];
  // What the log already believes. This runs on every page render, so emitting a line per criterion
  // per look would bury the record in polling noise — an audit log records CHANGES, not checks that
  // came back the same. Only a verdict that moved is news.
  const { data: before } = await sb
    .from("measurement")
    .select("criterion_id, satisfied")
    .eq("task_id", taskId);
  const previously = new Map(
    (before ?? []).map((m) => [
      m.criterion_id as string,
      m.satisfied as boolean,
    ]),
  );

  for (const c of criteria) {
    const verdict = await evaluate(actor, c, taskId);
    out.push({ ...c, verdict });
    const was = previously.get(c.id);

    if (verdict.state === "unmeasurable") {
      // Clear any stale measurement rather than leaving yesterday's answer standing.
      await sb
        .from("measurement")
        .delete()
        .eq("task_id", taskId)
        .eq("criterion_id", c.id);
      // Losing the ability to check something IS news — "we could no longer verify this" must
      // never read the same as "we never tried".
      if (was !== undefined) {
        await emit({
          engagementId: actor.engagementId,
          subjectType: "criterion",
          subjectId: c.id,
          verb: "criterion.unmeasurable",
          actorKind: "system",
          actorRoleCode: actor.roleCode,
          payload: {
            taskId,
            statement: c.statement,
            kind: c.kind,
            why: verdict.why,
            previously: was,
          },
        });
      }
      continue;
    }
    await sb.from("measurement").upsert(
      {
        task_id: taskId,
        criterion_id: c.id,
        satisfied: verdict.state === "satisfied",
        measured_at: new Date().toISOString(),
        source: verdict.source,
        detail: verdict.detail,
      },
      { onConflict: "task_id,criterion_id" },
    );

    const now = verdict.state === "satisfied";
    if (was !== now) {
      await emit({
        engagementId: actor.engagementId,
        subjectType: "criterion",
        subjectId: c.id,
        verb: now ? "criterion.met" : "criterion.unmet",
        actorKind: "system",
        actorRoleCode: actor.roleCode,
        payload: {
          taskId,
          statement: c.statement,
          kind: c.kind,
          source: verdict.source,
          detail: verdict.detail,
          previously: was ?? null,
        },
      });
    }
  }

  return out;
}

/**
 * Re-measure every row of a run that is still open.
 *
 * THE MEASUREMENT IS THE GATE, and it is only as current as the last thing that wrote it. Nothing
 * re-measured a row when the thing it waited on landed: the SOW was filed and published at 19:19,
 * and `Timeline & Milestones` went on showing "No document at sow" from a measurement taken at
 * 16:41 — a correct reading of a world that no longer existed. That is not cosmetic. `start_task`
 * refuses on `m.id is null or not m.satisfied`, so a stale unsatisfied row genuinely blocks work,
 * and the only cure was a person finding the `re-check` button on the queue.
 *
 * `storedStatusFor` stays read-only and a page render still writes nothing. The fix is to re-measure
 * on the EVENTS that can change a verdict — a row closing, a run opening — rather than on every
 * look.
 *
 * CLOSED ROWS ARE SKIPPED. Re-measuring one would delete the human attestations that closed it
 * (`measureTask` clears a measurement it can no longer evaluate), and a finished row would start
 * reading unfinished.
 */
export async function remeasureRun(
  actor: Actor,
  runId: string,
  depth = 0,
): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;

  const open = must(
    "read the run's rows to re-measure them",
    await sb
      .from("work_task")
      .select("id, state")
      .eq("workflow_run_id", runId)
      .neq("state", "closed"),
  );

  for (const t of open ?? []) {
    await measureTask(actor, t.id as string);

    // THE RETRY. Measuring is not the end of the story for a nesting row: the database already
    // tried to close it when its child run closed, and could only have failed. See
    // `closeNestingRowIfSatisfied` — the attempt happens inside the child's transaction, before the
    // measurements this very loop is writing exist.
    const closed = await closeNestingRowIfSatisfied(actor, t.id as string);
    if (!closed.closed) continue;

    // One hop up, and only up. Closing this row may have closed the run that holds it, which fires
    // the same trigger on ITS parent with the same stale measurements — so the cascade has to be
    // walked here or it stops one level short.
    if (depth >= MAX_CASCADE) {
      // A halt with a name on it. Deeper than this and something is wrong with the shape of the
      // nesting, not with the timing, and a silent stop would leave a row open with no record of
      // why nobody tried to close it.
      await emitRefusal({
        engagementId: actor.engagementId,
        subjectType: "task",
        subjectId: t.id as string,
        verb: "task.close_cascade_capped",
        actorRoleCode: actor.roleCode,
        reason: `Stopped walking up after ${MAX_CASCADE} levels of nesting.`,
        payload: { runId, depth },
      });
      continue;
    }
    const up = await parentRunOf(runId);
    if (up) await remeasureRun(actor, up, depth + 1);
  }
}

/** How far a close may cascade upward. Nesting is two or three deep; ten is a cycle, not a graph. */
const MAX_CASCADE = 5;

/**
 * Close a row that a finished child run has satisfied — the retry the database cannot do itself.
 *
 * `close_parent_task_when_child_run_closes` calls `close_task` from inside the CHILD's transaction,
 * and `close_task` does not measure anything: it reads `measurement` rows. Those are written here,
 * in Node, by connectors that talk to Confluence and Jira — and they run AFTER the close returns.
 * So the trigger can only ever see measurements taken before the child closed, which for a row
 * whose Done gate depends on what the child produced is guaranteed to be the stale answer. On the
 * live engagement the trigger refused at 18:57:55 with "timeline is published (not met: No document
 * at timeline)" and the re-measure wrote "timeline is published at v1.0" five seconds later. The
 * trigger's attempt is the optimistic first try; this is the one that can actually see the world.
 *
 * ONLY NESTING ROWS. An ordinary row's Done gate going green is not permission to close it — that
 * is the HITL gate, and a person presses it. A nesting row is different in kind: it has no draft of
 * its own and no reviewer, because every row of its child run carried its own gate and its own
 * approval. Nobody is being bypassed; there was never anybody there.
 *
 * Returns whether it closed anything — so `remeasureRun` knows whether to look further up, and so
 * the button a person presses can say what stopped it rather than going quiet.
 */
export type NestedClose = { closed: true } | { closed: false; why: string };

export async function closeNestingRowIfSatisfied(
  actor: Actor,
  taskId: string,
): Promise<NestedClose> {
  const no = (why: string): NestedClose => ({ closed: false, why });

  const sb = supabaseAdmin();
  if (!sb) return no("Supabase is not configured.");

  const { data: task } = await sb
    .from("work_task")
    .select("id, state, role_code, workflow_step_id, workflow_run_id")
    .eq("id", taskId)
    .eq("engagement_id", actor.engagementId)
    .maybeSingle();
  if (!task) return no("That task is not in your engagement.");
  if (task.state === "closed") return no("That row is already closed.");
  // `idle` is not a candidate: `close_task` refuses a row that never started, and rightly — there
  // is nothing to approve. Only a row someone opened a run from can be finished by one closing.
  if (task.state === "idle")
    return no("That row has not been started, so there is nothing to finish.");

  if (!task.workflow_step_id)
    return no("That row is ad-hoc — it nests no workflow.");
  const { data: step } = await sb
    .from("workflow_step")
    .select("nests_workflow_code")
    .eq("id", task.workflow_step_id)
    .maybeSingle();
  const nests = (step?.nests_workflow_code as string | null) ?? null;
  if (!nests)
    return no("That row is not satisfied by a nested workflow — approve it.");

  // The child run has to exist AND be finished. An aggregate over zero rows is the classic false
  // green: with no runs at all "every run has closed" is vacuously true, and this would close a
  // nesting row whose work had never been opened.
  const { data: runs } = await sb
    .from("workflow_run")
    .select("id, state")
    .eq("parent_task_id", taskId);
  const children = runs ?? [];
  if (!children.length) return no(`No ${nests} run has been opened yet.`);
  if (children.some((r) => r.state !== "closed"))
    return no(`The ${nests} run is still open.`);

  // Every Done criterion, measured and satisfied. Same set `close_task` will check — asking here
  // first is what keeps a doomed attempt out of the log and off the tracker.
  const done = (await criteriaForTask(taskId)).filter((c) => c.kind === "done");
  if (done.length) {
    const { data: ms } = await sb
      .from("measurement")
      .select("criterion_id, satisfied")
      .eq("task_id", taskId);
    const met = new Set(
      (ms ?? [])
        .filter((m) => m.satisfied)
        .map((m) => m.criterion_id as string),
    );
    const unmet = done.filter((c) => !met.has(c.id));
    // Named, not counted. "2 criteria are not met" sends someone hunting for which two.
    if (unmet.length)
      return no(`Not done:\n  ${unmet.map((c) => c.statement).join("\n  ")}`);
  }

  // The board closes first, for the reason `approve` states: the tracker holds the status of
  // record, and closing here while Jira still reads In Progress gives two answers with no arbiter.
  const moved = await mirrorState(
    actor.engagementId,
    taskId,
    "closed",
    actor.roleCode,
  );
  if (moveFailed(moved)) {
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.close_blocked_by_tracker",
      actorRoleCode: actor.roleCode,
      reason: moved.note ?? "The tracker refused to close this.",
      payload: { ticket: moved.key ?? null, nests },
    });
    return no(moved.note ?? "The tracker refused to close this.");
  }

  const { error } = await sb.rpc("close_task", {
    p_task_id: taskId,
    p_actor: "system",
    p_actor_role: (task.role_code as string) ?? actor.roleCode,
  });
  if (error) {
    // The gate said no after the ticket moved. Put it back, exactly as `approve` does — the board
    // must not read Done for a row Compass will not close.
    if (moved.ok)
      await mirrorState(actor.engagementId, taskId, "hitl", actor.roleCode);
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.child_run_closed_gate_not_met",
      actorRoleCode: actor.roleCode,
      reason: error.message,
      payload: { nests, retried: true, ticketReturned: moved.ok },
    });
    return no(error.message);
  }

  // The verb the trigger uses when it succeeds. Same fact, later — and `actorKind: "system"` is the
  // honest part: `close_task` writes its own `task.closed` as a human because its actor kind is
  // hardcoded, and nobody pressed anything here.
  await emit({
    engagementId: actor.engagementId,
    subjectType: "task",
    subjectId: taskId,
    verb: "task.satisfied_by_child_run",
    actorKind: "system",
    actorRoleCode: actor.roleCode,
    payload: { nests, runs: children.map((r) => r.id), retried: true },
  });
  return { closed: true };
}

/**
 * The run that holds the task a nested run hangs off — one hop up, or null at the top.
 *
 * Two joins, not one: `workflow_run.parent_task_id` names a TASK, and what has to be re-measured is
 * that task's siblings as well as the task itself.
 */
async function parentRunOf(runId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: run } = await sb
    .from("workflow_run")
    .select("parent_task_id")
    .eq("id", runId)
    .maybeSingle();
  if (!run?.parent_task_id) return null;

  const { data: parent } = await sb
    .from("work_task")
    .select("workflow_run_id")
    .eq("id", run.parent_task_id)
    .maybeSingle();
  return (parent?.workflow_run_id as string | null) ?? null;
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
    passes:
      mine.length > 0 && mine.every((s) => s.verdict.state === "satisfied"),
  };
}

/* ── reading what was already measured ───────────────────────────────────── */

export type StoredStatus = CriterionRow & {
  satisfied: boolean | null; // null = never checked
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
export async function storedStatusFor(
  taskIds: string[],
): Promise<Map<string, StoredStatus[]>> {
  const out = new Map<string, StoredStatus[]>();
  const sb = supabaseAdmin();
  if (!sb || taskIds.length === 0) return out;

  const { data: tasks } = await sb
    .from("work_task")
    .select(
      "id, workflow_step_id, workflow_run!work_task_workflow_run_id_fkey(workflow_version_id)",
    )
    .in("id", taskIds);

  const { data: steps } = await sb.from("workflow_step").select("id, task");
  const taskOf = new Map((steps ?? []).map((s) => [s.id, s.task as string]));

  const versionIds = [
    ...new Set(
      (tasks ?? [])
        .map((t) => {
          const r = t.workflow_run as unknown as
            | { workflow_version_id: string }
            | { workflow_version_id: string }[]
            | null;
          return Array.isArray(r)
            ? r[0]?.workflow_version_id
            : r?.workflow_version_id;
        })
        .filter(Boolean),
    ),
  ] as string[];

  const { data: criteria } = versionIds.length
    ? await sb
        .from("criterion")
        .select(
          "id, workflow_version_id, kind, step_task, statement, subject_kind, subject_ref, operator, value, ord",
        )
        .in("workflow_version_id", versionIds)
        .order("ord")
    : { data: [] };

  const { data: measurements } = await sb
    .from("measurement")
    .select("task_id, criterion_id, satisfied, measured_at, source, detail")
    .in("task_id", taskIds);
  const key = (t: string, c: string) => `${t}:${c}`;
  const measured = new Map(
    (measurements ?? []).map((m) => [key(m.task_id, m.criterion_id), m]),
  );

  for (const t of tasks ?? []) {
    const r = t.workflow_run as unknown as
      | { workflow_version_id: string }
      | { workflow_version_id: string }[]
      | null;
    const versionId = Array.isArray(r)
      ? r[0]?.workflow_version_id
      : r?.workflow_version_id;
    const stepTask = t.workflow_step_id
      ? (taskOf.get(t.workflow_step_id) ?? null)
      : null;

    const mine = (criteria ?? [])
      .filter((c) => c.workflow_version_id === versionId)
      .filter((c) => c.step_task === null || c.step_task === stepTask)
      .map((c): StoredStatus => {
        const m = measured.get(key(t.id, c.id));
        return {
          id: c.id,
          kind: c.kind,
          stepTask: c.step_task,
          statement: c.statement,
          subjectKind: c.subject_kind,
          subjectRef: c.subject_ref,
          operator: c.operator,
          value: c.value,
          satisfied: m ? m.satisfied : null,
          measuredAt: m?.measured_at ?? null,
          source: m?.source ?? null,
          detail: m?.detail ?? null,
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
  actor: Actor,
  taskId: string,
  confirmed: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  // The run comes back with the task because the close has to re-measure the rows it unblocks, and
  // asking again afterwards would be a second round-trip for something already in hand.
  const { data: task } = await sb
    .from("work_task")
    .select("id, workflow_run_id")
    .eq("id", taskId)
    .eq("engagement_id", actor.engagementId)
    .maybeSingle();
  if (!task)
    return { ok: false, error: "That task is not in your engagement." };

  const runId = task.workflow_run_id as string | null;
  const parentRunId = runId ? await parentRunOf(runId) : null;

  const who = actor.holder ?? actor.roleCode;
  const criteria = await criteriaForTask(taskId);
  const done = criteria.filter((c) => c.kind === "done");

  // What a CHECK established stays the check's. Overwriting it with "Confirmed by <name>" put a
  // person's signature on seventeen rows a script verified — the record then says they personally
  // checked something they never looked at, which is worse than no record.
  const { data: existing } = await sb
    .from("measurement")
    .select("criterion_id, source, satisfied")
    .eq("task_id", taskId);
  const machineMet = new Set(
    (existing ?? [])
      .filter((m) => m.satisfied && m.source !== "human")
      .map((m) => m.criterion_id as string),
  );

  for (const c of done) {
    if (machineMet.has(c.id)) continue;
    if (!confirmed.includes(c.id)) {
      // Not confirmed is not "failed" — it is unmeasured, and the gate treats it as such. Writing
      // satisfied:false here would say the person checked and rejected it, which they did not.
      await sb
        .from("measurement")
        .delete()
        .eq("task_id", taskId)
        .eq("criterion_id", c.id);
      continue;
    }
    await sb.from("measurement").upsert(
      {
        task_id: taskId,
        criterion_id: c.id,
        satisfied: true,
        measured_at: new Date().toISOString(),
        source: "human",
        detail: `Confirmed by ${who}.`,
      },
      { onConflict: "task_id,criterion_id" },
    );

    // A person putting their name to something a machine could not check is the single most
    // consequential act in the system. It was previously invisible in the log.
    await emit({
      engagementId: actor.engagementId,
      subjectType: "criterion",
      subjectId: c.id,
      verb: "criterion.attested",
      actorKind: "human",
      actorRoleCode: actor.roleCode,
      actorUserId: who,
      payload: { taskId, statement: c.statement, satisfied: true },
    });
  }

  // The BOARD closes first, and this order is the whole point.
  //
  // The tracker holds the status of record. Closing here and telling Jira afterwards — which is
  // what this did — leaves Compass claiming Done while the board still says To Do whenever the
  // move is refused or the board has no Done status to move to. Two answers, no arbiter, and the
  // wrong one is the one people look at.
  //
  // "Nothing to move" is not a failure: an engagement with no tracker, or a task with no ticket
  // (phase 1 configures the tracker, so its own rows predate it), closes exactly as before.
  const moved = await mirrorState(
    actor.engagementId,
    taskId,
    "closed",
    actor.roleCode,
  );
  if (moveFailed(moved)) {
    // Distinct from a gate refusing: the work was accepted and the BOARD would not take it. Someone
    // reading the record needs to tell "the criteria were not met" from "the board has no Done
    // status", because they are different problems with different fixes.
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.close_blocked_by_tracker",
      actorRoleCode: actor.roleCode,
      actorUserId: who,
      reason: moved.note ?? "The tracker refused to close this.",
      payload: {
        ticket: moved.key ?? null,
        status: moved.status ?? null,
        kind: moved.reason ?? null,
      },
    });
    return {
      ok: false,
      error: moved.note ?? "The tracker refused to close this.",
    };
  }

  const { error } = await sb.rpc("close_task", {
    p_task_id: taskId,
    p_actor: who,
    p_actor_role: actor.roleCode,
  });
  if (error) {
    // The gate refused AFTER the ticket moved. Put the ticket back rather than leave the board
    // reading Done for work Compass will not close — best effort, and the failure the caller sees
    // is the gate's, which is the one that explains what to fix.
    if (moved.ok)
      await mirrorState(actor.engagementId, taskId, "hitl", actor.roleCode);
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.close_refused",
      actorRoleCode: actor.roleCode,
      actorUserId: who,
      reason: error.message,
      payload: { confirmed: confirmed.length, ticketReturned: moved.ok },
    });
    return { ok: false, error: error.message };
  }

  // An approved document that the app must KNOW becomes state here — the roster into `member` rows,
  // and whatever else registers later. Only on approval: a draft is a proposal, and materialising
  // one would let an agent staff an engagement by suggesting names.
  //
  // ITS PROBLEMS ARE EMITTED, not discarded. This call's result was dropped on the floor, so an
  // approved roster that staffed nobody — every insert rejected — closed the gate green and said
  // nothing anywhere. "Never fatal, and never silent" is the rule materialise.ts states in its own
  // header; the second half was not held to. Not fatal here either: the human accepted the
  // document, and refusing the close now would blame them for a write that failed after it.
  const materialised = await materialiseFrom(actor, taskId);
  if (materialised?.problems.length) {
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.materialise_incomplete",
      actorRoleCode: actor.roleCode,
      actorUserId: who,
      reason: materialised.problems.join(" · "),
      payload: {
        path: materialised.path,
        created: materialised.created,
        updated: materialised.updated,
      },
    });
  }

  try {
    if (runId) await remeasureRun(actor, runId);
    if (parentRunId) await remeasureRun(actor, parentRunId);
  } catch (e) {
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.remeasure_incomplete",
      actorRoleCode: actor.roleCode,
      actorUserId: who,
      reason: e instanceof Error ? e.message : String(e),
      payload: { runId, parentRunId },
    });
  }

  // Approving the backlog no longer materialises anything.
  //
  // It used to open a workflow run per row, because each row WAS a workflow. Now the rows of a
  // phase are its tasks, created when the delivery manager initiates it — so approving the backlog
  // approves a document, which is all it ever claimed to do. See lib/data/phases.ts.
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
  actor: Actor,
  taskId: string,
  rejections: { criterionId: string; reason: string }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const { data: task } = await sb
    .from("work_task")
    .select("id, state")
    .eq("id", taskId)
    .eq("engagement_id", actor.engagementId)
    .maybeSingle();
  if (!task)
    return { ok: false, error: "That task is not in your engagement." };

  const given = rejections.filter((r) => r.reason.trim().length > 0);
  if (!given.length) {
    // A rejection with no reason is not a rejection, it is a refusal to explain. The agent cannot
    // act on it and the next reviewer cannot tell what was wrong.
    return {
      ok: false,
      error: "A rejection needs a reason — the agent has to act on it.",
    };
  }

  // Links in the reasons are read before anything is written. "Doesn't follow <link to the
  // standard>" is a useful send-back only if the agent gets the standard, and it cannot open a URL.
  // One unreadable link refuses the whole send-back, so the reviewer can paste the text instead.
  const typed = `Sent back for revision:\n\n${given.map((r) => `- ${r.reason.trim()}`).join("\n")}`;
  const read = await expandLinks(typed);
  if (!read.ok) return { ok: false, error: read.error };

  const who = actor.holder ?? actor.roleCode;
  for (const r of given) {
    // The short reason as typed: this is what the gate and the next reviewer read.
    await sb.from("measurement").upsert(
      {
        task_id: taskId,
        criterion_id: r.criterionId,
        satisfied: false,
        measured_at: new Date().toISOString(),
        source: "human",
        detail: `Rejected by ${who}: ${r.reason.trim()}`,
      },
      { onConflict: "task_id,criterion_id" },
    );

    await emit({
      engagementId: actor.engagementId,
      subjectType: "criterion",
      subjectId: r.criterionId,
      verb: "criterion.rejected",
      actorKind: "human",
      actorRoleCode: actor.roleCode,
      actorUserId: who,
      payload: {
        taskId,
        reason: r.reason.trim(),
        links: read.links.filter((l) => r.reason.includes(l.url)),
      },
    });
  }

  // Back to running: there is work to do, and it is the agent's. Leaving it at `hitl` would say
  // it is still waiting on a human when the human has just answered.
  await sb.from("work_task").update({ state: "running" }).eq("id", taskId);

  const { data: last } = await sb
    .from("turn")
    .select("ord")
    .eq("task_id", taskId)
    .order("ord", { ascending: false })
    .limit(1);
  await sb.from("turn").insert({
    task_id: taskId,
    ord: (last?.[0]?.ord ?? -1) + 1,
    author_kind: "human",
    author_role_code: actor.roleCode,
    author_user_id: who,
    // With every linked page attached — this turn is what the agent replays on its revision run.
    body: read.text,
  });

  return { ok: true };
}

/**
 * Check the engagement's connectors right now, without a task.
 *
 * The same evaluators the gate uses, callable on their own — for a setup screen, and for answering
 * "can Compass actually reach Confluence" without having to find a task whose gate happens to ask.
 */
export async function checkConnectors(
  actor: Actor,
): Promise<{ connector: string; verdict: Verdict }[]> {
  const shape = (ref: string): CriterionRow => ({
    id: "",
    kind: "ready",
    stepTask: null,
    statement: "",
    subjectKind: "connector",
    subjectRef: ref,
    operator: "is",
    value: "wired",
  });
  return Promise.all(
    ["docs", "tickets"].map(async (connector) => ({
      connector,
      verdict: await evaluate(actor, shape(connector)),
    })),
  );
}

/**
 * The sprint's criteria, answered by asking the tracker.
 *
 * NOT by reading what Compass believes it wrote. A gate that grades its own homework passes on a
 * sprint whose tickets never reached the board, and that is the whole reason this feature keeps no
 * sprint table: the board is the record, so the board is what gets asked.
 *
 * Three ways this could pass while checking nothing, all closed here:
 *
 *   an EMPTY result — the query ran and matched nothing. Every issue in an empty set satisfies
 *   every condition, so `every()` returns true and a sprint containing nothing would be reported
 *   complete. Unmeasurable.
 *
 *   a FAILED query — `searchIssues` returns null for "could not ask", which is why it does not
 *   return `[]` for it. Unmeasurable, with the reason.
 *
 *   NO SPRINT NUMBER — the task never claimed one, so nothing was ever labelled. That is
 *   unsatisfied rather than unmeasurable: "nothing reached the board" is a real, checkable answer,
 *   and calling it unmeasurable would let it read as a tooling gap rather than as work not done.
 */
async function evaluateTicket(
  actor: Actor,
  c: CriterionRow,
  taskId: string | null,
): Promise<Verdict> {
  const sb = supabaseAdmin();
  if (!sb || !taskId)
    return { state: "unmeasurable", why: "no task to read a sprint from" };

  // STORY-SCOPED FIRST. The refs below are about ONE issue — the story this run is about — and
  // everything after them is about a sprint's worth of them. They were separated rather than folded
  // together because `sprintNoOf` returns null for a build run, and falling through would report
  // "this plan has no sprint number" for a workflow that never had one.
  if (c.subjectRef === "pr-linked" || c.subjectRef === "merged") {
    return evaluateStoryTicket(actor, c, taskId);
  }

  const n = await sprintNoOf(taskId);
  if (!n) {
    return {
      state: "unsatisfied",
      source: "compass",
      detail:
        "This plan has no sprint number, so no story was ever labelled or assigned. " +
        "Nothing reached the board.",
    };
  }

  const { data: eng } = await sb
    .from("engagement")
    .select(
      "jira_project, atlassian_base_url, atlassian_email, atlassian_api_token",
    )
    .eq("id", actor.engagementId)
    .maybeSingle();
  const creds = eng ? resolveJira(eng) : null;
  if (!creds)
    return {
      state: "unmeasurable",
      why: "no Jira is configured for this engagement",
    };

  const issues = await searchIssues(creds, sprintJql(creds.project, n), [
    "assignee",
    "labels",
    "parent",
  ]);
  if (issues === null) {
    return {
      state: "unmeasurable",
      why: `the board could not be read for sprint ${n}`,
    };
  }
  if (!issues.length) {
    // The zero-row trap, said out loud. `every()` over nothing is true.
    return {
      state: "unmeasurable",
      why: `no issue on the board carries sprint ${n} — there is nothing to check`,
    };
  }

  const { data: roleRows } = await sb
    .from("role")
    .select("code")
    .eq("org_id", actor.orgId);
  const knownRoles = new Set((roleRows ?? []).map((r) => r.code as string));

  if (c.subjectRef === "committed-have-epic") {
    const orphans = issues.filter((i) => !i.fields.parent);
    return orphans.length === 0
      ? {
          state: "satisfied",
          source: "tracker",
          detail: `All ${issues.length} stories in sprint ${n} sit under an epic.`,
        }
      : {
          state: "unsatisfied",
          source: "tracker",
          detail: `${orphans.length} of ${issues.length} have no epic: ${orphans.map((o) => o.key).join(", ")}.`,
        };
  }

  if (c.subjectRef === "on-board") {
    const unassigned = issues.filter((i) => !i.fields.assignee);
    const unowned = issues.filter((i) => {
      const labels = Array.isArray(i.fields.labels)
        ? (i.fields.labels as string[])
        : [];
      return !labels.some((l) => knownRoles.has(l));
    });
    if (!unassigned.length && !unowned.length) {
      return {
        state: "satisfied",
        source: "tracker",
        detail: `All ${issues.length} stories in sprint ${n} have an owning role and an assignee.`,
      };
    }
    // Named, not counted. "KAN-14, KAN-19" sends someone somewhere; "2 of 11" sends them hunting.
    const parts: string[] = [];
    if (unassigned.length)
      parts.push(`unassigned: ${unassigned.map((i) => i.key).join(", ")}`);
    if (unowned.length)
      parts.push(`no owning role: ${unowned.map((i) => i.key).join(", ")}`);
    return {
      state: "unsatisfied",
      source: "tracker",
      detail: `Of ${issues.length} stories in sprint ${n} — ${parts.join("; ")}.`,
    };
  }

  return {
    state: "unmeasurable",
    why: `judgment — a person decides '${c.subjectRef}'`,
  };
}
