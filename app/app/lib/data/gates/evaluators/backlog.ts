import { supabaseAdmin } from "../../../supabase";
import type { Actor } from "../../actor";
import type { CriterionRow, Verdict } from "../types";

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
export async function evaluateBacklog(
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
