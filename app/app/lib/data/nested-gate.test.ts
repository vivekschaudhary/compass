import { describe, expect, it, vi, beforeEach } from "vitest";

// A nesting row cannot close until every run it opened has closed.
//
// The defect this exists for: `openNestedFanOut` opens ONE child run per epic against ONE parent
// task, and `close_parent_task_when_child_run_closes` fires as each of them closes. With no gate on
// the row, the first epic to finish closed the parent — and the remaining epics kept running behind
// a row the plan already counted as done.
//
// The second thing it guards is subtler and is AGENTS.md rule 11: "every run has closed" over an
// EMPTY set is true. If that read as satisfied, the row could close before anyone opened anything.

vi.mock("server-only", () => ({}));

type Run = { state: string };
const state: { runs: Run[] | null; error: string | null } = { runs: [], error: null };
let askedFor: { table: string; parent: string | null } = { table: "", parent: null };

vi.mock("../supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../supabase")>()),
  supabaseAdmin: () => ({
    from(table: string) {
      askedFor = { table, parent: null };
      const chain = {
        select: () => chain,
        eq: (col: string, v: string) => {
          if (col === "parent_task_id") askedFor.parent = v;
          return chain;
        },
        then: (resolve: (r: { data: Run[] | null; error: { message: string } | null }) => void) =>
          resolve({ data: state.runs, error: state.error ? { message: state.error } : null }),
      };
      return chain;
    },
  }),
}));

const { evaluate } = await import("./gates");

const actor = { engagementId: "eng", orgId: "org", roleCode: "product-owner" } as never;
const criterion = {
  id: "c1", kind: "done" as const, stepTask: "design-epics-tech",
  statement: "Every tech-design run this row opened has closed.",
  subjectKind: "nested", subjectRef: "tech-design", operator: "is", value: "closed",
};

beforeEach(() => { state.runs = []; state.error = null; });

describe("the nested-run gate", () => {
  it("is UNMEASURABLE before anything has been opened, never satisfied", async () => {
    state.runs = [];
    const v = await evaluate(actor, criterion, "task-1");
    expect(v.state).toBe("unmeasurable");
    if (v.state !== "unmeasurable") return;
    expect(v.why).toContain("tech-design");
  });

  // The regression. Three epics, one done: the row must NOT be closeable.
  it("is unsatisfied while any child run is still open, and says how many", async () => {
    state.runs = [{ state: "closed" }, { state: "open" }, { state: "open" }];
    const v = await evaluate(actor, criterion, "task-1");
    expect(v.state).toBe("unsatisfied");
    if (v.state !== "unsatisfied") return;
    expect(v.detail).toContain("2 of 3");
  });

  it("is satisfied only once every child run has closed", async () => {
    state.runs = [{ state: "closed" }, { state: "closed" }];
    const v = await evaluate(actor, criterion, "task-1");
    expect(v.state).toBe("satisfied");
    if (v.state !== "satisfied") return;
    expect(v.detail).toContain("All 2");
  });

  it("asks for the runs of THIS task", async () => {
    state.runs = [{ state: "closed" }];
    await evaluate(actor, criterion, "task-42");
    expect(askedFor.table).toBe("workflow_run");
    expect(askedFor.parent).toBe("task-42");
  });

  it("is unmeasurable for a row that is not part of a run at all", async () => {
    const v = await evaluate(actor, criterion, null);
    expect(v.state).toBe("unmeasurable");
  });

  // A failed read is not "no runs". Reading it as unmeasurable would be honest but silent; this
  // throws, because a gate that cannot see the runs must not answer about them at all.
  it("throws when the read fails rather than reporting no runs", async () => {
    state.error = "connection reset";
    await expect(evaluate(actor, criterion, "task-1")).rejects.toThrow("read nested runs");
  });
});
