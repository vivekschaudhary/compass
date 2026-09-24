import { describe, it, expect } from "vitest";
import { planWorkflowReset, describeWorkflowReset, IDLE_FIELDS, type WorkflowResetSnapshot } from "./reset-workflow";

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
