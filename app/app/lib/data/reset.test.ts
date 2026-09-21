import { describe, it, expect } from "vitest";
import { planReset, describeReset, KEPT_VERB, type ResetSnapshot } from "./reset";

const snap = (over: Partial<ResetSnapshot> = {}): ResetSnapshot => ({
  engagementId: "acme-1a2b",
  tasks: [{ id: "t1", workflowRunId: "r1" }],
  runs: [{ id: "r1" }],
  documents: [{ id: "d1", path: "sow", externalUrl: null }],
  events: [{ id: "e1", verb: KEPT_VERB }, { id: "e2", verb: "task.closed" }],
  ...over,
});

const planOf = (s: ResetSnapshot) => {
  const r = planReset(s);
  if (!r.ok) throw new Error(r.refusals.map((p) => p.message).join("; "));
  return r.plan;
};
const step = (s: ResetSnapshot, table: string) =>
  planOf(s).deletes.find((d) => d.table === table)!;

describe("planning an engagement reset", () => {
  it("deletes tasks before the runs they belong to", () => {
    // Not cosmetic. A task pointing at a step from a version its run no longer names is recoverable;
    // the reverse ordering leaves rows that read as coherent and are not.
    const order = planOf(snap()).deletes.map((d) => d.table);
    expect(order.indexOf("work_task")).toBeLessThan(order.indexOf("workflow_run"));
  });

  it("includes ad-hoc tasks, which have no run to reach them through", () => {
    // THE REASON work_task is deleted by engagement rather than by walking the runs.
    // `workflow_run_id` is nullable — unplanned work has no run — so a run-first delete would
    // strand exactly the rows that record what actually happened rather than what was planned.
    const s = snap({
      tasks: [{ id: "t1", workflowRunId: "r1" }, { id: "adhoc", workflowRunId: null }],
    });
    expect(step(s, "work_task").ids).toEqual(["t1", "adhoc"]);
  });

  it("keeps engagement.created and deletes every other event", () => {
    const s = snap({
      events: [
        { id: "e1", verb: KEPT_VERB },
        { id: "e2", verb: "task.closed" },
        { id: "e3", verb: "workflow.opened" },
      ],
    });
    expect(step(s, "event").ids).toEqual(["e2", "e3"]);
    expect(planOf(s).keeps.find((k) => k.table === "event")!.count).toBe(1);
  });

  it("keeps nothing when the log has no engagement.created", () => {
    // The kept verb is a filter, not an assumption that one exists. An engagement created before
    // the event table did has none, and that must delete cleanly rather than throw.
    const s = snap({ events: [{ id: "e2", verb: "task.closed" }] });
    expect(step(s, "event").ids).toEqual(["e2"]);
    expect(planOf(s).keeps.find((k) => k.table === "event")!.count).toBe(0);
  });

  it("counts documents whose page lives in the doc store", () => {
    // This clears Compass's side only. The count is what stops the report reading as though the
    // Confluence pages went with it.
    const s = snap({
      documents: [
        { id: "d1", path: "sow", externalUrl: "https://example.atlassian.net/wiki/x" },
        { id: "d2", path: "timeline", externalUrl: null },
      ],
    });
    expect(planOf(s).publishedElsewhere).toBe(1);
    expect(step(s, "document").ids).toEqual(["d1", "d2"]);   // both still deleted here
  });

  it("names the cascades rather than leaving them for the reader to know", () => {
    expect(step(snap(), "work_task").cascades).toContain("measurement");
    expect(step(snap(), "work_task").cascades).toContain("backlog_item");
    expect(step(snap(), "document").cascades).toContain("document_version");
  });

  it("refuses an engagement that holds nothing", () => {
    // A mistyped id is the overwhelmingly likely cause, and four zeroes with exit 0 is
    // indistinguishable from a reset that worked — after which the import runs against an
    // engagement nobody cleared.
    const r = planReset(snap({ tasks: [], runs: [], documents: [], events: [] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals[0].message).toContain("acme-1a2b");
    expect(r.refusals[0].fix).toContain("Check the id");
  });

  it("refuses an unnamed engagement", () => {
    const r = planReset(snap({ engagementId: "" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusals[0].fix).toContain("--all");
  });

  it("reports a count for every step, including the ones at zero", () => {
    // A report that prints only what it found cannot be read as a complete statement of what it
    // will do — the line that is missing is the one nobody checks.
    const lines = describeReset(planOf(snap({ runs: [] })));
    expect(lines.some((l) => /workflow_run/.test(l))).toBe(true);
    for (const t of ["work_task", "workflow_run", "document", "event"]) {
      expect(lines.some((l) => l.includes(t)), `${t} missing from the report`).toBe(true);
    }
  });
});
