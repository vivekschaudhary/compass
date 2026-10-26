import { describe, it, expect } from "vitest";
import {
  planWorkflowReset, planRunReset, describeWorkflowReset, IDLE_FIELDS,
  type WorkflowResetSnapshot, type RunResetSnapshot,
} from "./reset-workflow";

const snap = (over: Partial<WorkflowResetSnapshot> = {}): WorkflowResetSnapshot => ({
  engagementId: "acme-1a2b",
  nestingTaskId: "t-nest",
  nestsWorkflowCode: "timeline",
  runs: [{ id: "r1" }],
  tasks: [{ id: "t1" }],
  documents: [{ id: "d1", path: "timeline", externalUrl: null }],
  events: [{ id: "e1" }],
  ...over,
});

const planOf = (s: WorkflowResetSnapshot) => {
  const r = planWorkflowReset(s);
  if (!r.ok) throw new Error(r.refusals.map((p) => p.message).join("; "));
  return r.plan;
};
const step = (s: WorkflowResetSnapshot, table: string) =>
  planOf(s).deletes.find((d) => d.table === table)!;

describe("planning a single nesting row's reset", () => {
  it("deletes tasks before the runs they belong to", () => {
    const order = planOf(snap()).deletes.map((d) => d.table);
    expect(order.indexOf("work_task")).toBeLessThan(order.indexOf("workflow_run"));
  });

  it("resets the nesting row to idle — the SAME shape `open_nested_run` found it in", () => {
    const resets = planOf(snap()).resets;
    expect(resets).toHaveLength(1);
    expect(resets[0].id).toBe("t-nest");
    expect(resets[0].fields).toEqual(IDLE_FIELDS);
  });

  it("does not delete the nesting row itself", () => {
    const plan = planOf(snap());
    for (const d of plan.deletes) expect(d.ids).not.toContain("t-nest");
  });

  it("counts documents whose page lives in the doc store", () => {
    const s = snap({
      documents: [
        { id: "d1", path: "timeline", externalUrl: "https://example.atlassian.net/wiki/x" },
      ],
    });
    expect(planOf(s).publishedElsewhere).toBe(1);
    expect(step(s, "document").ids).toEqual(["d1"]);
  });

  it("names the cascades rather than leaving them for the reader to know", () => {
    expect(step(snap(), "work_task").cascades).toContain("measurement");
    expect(step(snap(), "document").cascades).toContain("document_version");
  });

  it("handles a row that was never opened — zero runs, zero everything", () => {
    // Not a refusal: unlike a mistyped ENGAGEMENT id (where zero rows almost certainly means the
    // wrong id), a task id here is already resolved and known to nest a workflow — it just has not
    // been started yet. Resetting it is a harmless no-op that still puts the row back to idle.
    const s = snap({ runs: [], tasks: [], documents: [], events: [] });
    const plan = planOf(s);
    for (const d of plan.deletes) expect(d.ids).toEqual([]);
    expect(plan.resets[0].fields).toEqual(IDLE_FIELDS);
  });

  it("refuses a task that does not nest a workflow", () => {
    const r = planWorkflowReset(snap({ nestsWorkflowCode: null }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals[0].message).toContain("does not nest a workflow");
  });

  it("refuses an unnamed engagement or task", () => {
    expect(planWorkflowReset(snap({ engagementId: "" })).ok).toBe(false);
    expect(planWorkflowReset(snap({ nestingTaskId: "" })).ok).toBe(false);
  });

  it("reports a count for every step, including zero, and the reset line", () => {
    const lines = describeWorkflowReset(planOf(snap({ runs: [] })));
    for (const t of ["work_task", "workflow_run", "document", "event"]) {
      expect(lines.some((l) => l.includes(t)), `${t} missing from the report`).toBe(true);
    }
    expect(lines.some((l) => l.includes("t-nest"))).toBe(true);
  });
});

// ── a top-level run (no nesting row opened it) ───────────────────────────────────────────────────

const runSnap = (over: Partial<RunResetSnapshot> = {}): RunResetSnapshot => ({
  engagementId: "acme-1a2b",
  workflowCode: "tech-design",
  runs: [{ id: "r1", state: "open", subjectRef: "ACC-E1", subjectKey: "CT-288" }],
  tasks: [{ id: "t1", ticketKey: "CT-353" }, { id: "t2", ticketKey: "CT-354" }],
  documents: [],
  events: [{ id: "e1" }],
  ...over,
});
const runPlan = (s: RunResetSnapshot) => {
  const r = planRunReset(s);
  if (!r.ok) throw new Error(r.refusals.map((p) => p.message).join("; "));
  return r.plan;
};

describe("planning a top-level run's reset", () => {
  it("deletes the tasks — and through them the agent turns and questions — before the run", () => {
    const plan = runPlan(runSnap());
    const order = plan.deletes.map((d) => d.table);
    expect(order.indexOf("work_task")).toBeLessThan(order.indexOf("workflow_run"));
    const tasks = plan.deletes.find((d) => d.table === "work_task")!;
    expect(tasks.ids).toEqual(["t1", "t2"]);
    expect(tasks.cascades).toEqual(expect.arrayContaining(["turn", "question", "measurement"]));
  });

  it("has no row to put back to idle — the run was the thing that existed", () => {
    expect(runPlan(runSnap()).resets).toEqual([]);
  });

  it("names the tickets it leaves in the tracker, so closing them is a decision not a surprise", () => {
    expect(runPlan(runSnap()).ticketsLeftInTracker).toEqual(["CT-353", "CT-354"]);
    expect(runPlan(runSnap({ tasks: [{ id: "t1", ticketKey: null }] })).ticketsLeftInTracker).toEqual([]);
  });

  it("names the documents it will delete, and counts the ones already published elsewhere", () => {
    const plan = runPlan(runSnap({
      documents: [{ id: "d1", path: "epic/CT-288", externalUrl: "https://x.atlassian.net/wiki/y" }],
    }));
    expect(plan.documentPaths).toEqual(["epic/CT-288"]);
    expect(plan.publishedElsewhere).toBe(1);
  });

  it("REFUSES a phase run — one with no subject — rather than widen to a month of work", () => {
    const r = planRunReset(runSnap({ runs: [{ id: "phase", state: "open", subjectRef: null, subjectKey: null }] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals[0].message).toContain("phase run");
    expect(r.refusals[0].fix).toContain("/api/cleanup/workflow");
  });

  it("refuses when there is nothing to reset, and an unnamed engagement", () => {
    expect(planRunReset(runSnap({ runs: [] })).ok).toBe(false);
    expect(planRunReset(runSnap({ engagementId: "" })).ok).toBe(false);
  });

  it("is reported in the same shape as a nesting reset, with a line per step", () => {
    const lines = describeWorkflowReset(runPlan(runSnap()));
    for (const t of ["work_task", "workflow_run", "document", "event"]) {
      expect(lines.some((l) => l.includes(t)), `${t} missing`).toBe(true);
    }
  });
});
