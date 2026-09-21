import { describe, expect, it, vi, beforeEach } from "vitest";

// What a nesting row opened, for a person to read.
//
// `evaluateNested` already asks whether every child run has closed — that is the GATE, and it
// answers yes or no. This answers a different question: what actually happened when you pressed
// the button. The job page had no way to ask it, so a row that had opened a whole child run
// rendered exactly like one that had not — which is why "I started it and nothing happened" was a
// reasonable thing to say about a run that had opened fine.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const state: { runs: Row[]; tasks: Row[] } = { runs: [], tasks: [] };
/** The parent the caller filtered on, so a test can prove the filter is applied at all. */
let askedParent: string | null = null;

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, v: string) => {
          if (col === "parent_task_id") askedParent = v;
          return chain;
        },
        in: () => chain,
        is: () => chain,
        order: () => chain,
        then: (res: (v: { data: Row[] }) => unknown) =>
          res({ data: table === "workflow_run" ? state.runs : state.tasks }),
      };
      return chain;
    },
  }),
}));

vi.mock("./events", () => ({ orgIdFor: async () => "org-1", emit: async () => {}, emitRefusal: async () => {} }));
vi.mock("./gates", () => ({ measureTask: async () => [], storedStatusFor: async () => null, evaluate: async () => ({}) }));
vi.mock("./tracker", () => ({ mirrorPhase: async () => ({ epic: null, stories: [], expected: 0, problems: [] }) }));
vi.mock("./ticket-body", () => ({ composeTicketBodies: async () => ({ written: [], expected: 0, problems: [] }) }));
vi.mock("./steps", () => ({ sortByStep: <T,>(x: T[]) => x }));

const { childRunsOf } = await import("./phases");

const actor = { engagementId: "e1", orgId: "org-1", roleCode: "delivery-manager" } as never;

const task = (id: string, runId: string, over: Row = {}) => ({
  id, workflow_run_id: runId, title: `Task ${id}`, role_code: "delivery-manager",
  state: "idle", ticket_key: null, ord: 1, ...over,
});

beforeEach(() => { state.runs = []; state.tasks = []; askedParent = null; });

describe("childRunsOf", () => {
  it("returns nothing for a row that has opened no run", async () => {
    expect(await childRunsOf(actor, "t1")).toEqual([]);
    expect(askedParent).toBe("t1");
  });

  it("returns the run and the rows inside it", async () => {
    state.runs = [{ id: "r1", state: "open", subject_key: null, opened_at: "2026-09-21" }];
    state.tasks = [task("a", "r1", { title: "Draft the timeline", ticket_key: "CT-160" })];

    const [run] = await childRunsOf(actor, "t1");

    expect(run.runId).toBe("r1");
    expect(run.state).toBe("open");
    expect(run.tasks).toEqual([
      { id: "a", title: "Draft the timeline", roleCode: "delivery-manager", state: "idle", ticketKey: "CT-160" },
    ]);
  });

  it("keeps each run's rows with that run when a row fans out per epic", async () => {
    // One run per epic against one parent task. Tasks arrive in a single query, so a mistake here
    // would attach every row to every run — and the screen would claim work that is not there.
    state.runs = [
      { id: "r1", state: "open", subject_key: "EPIC-1", opened_at: "2026-09-21" },
      { id: "r2", state: "closed", subject_key: "EPIC-2", opened_at: "2026-09-22" },
    ];
    state.tasks = [task("a", "r1"), task("b", "r2"), task("c", "r2")];

    const runs = await childRunsOf(actor, "t1");

    expect(runs.map((r) => r.subject)).toEqual(["EPIC-1", "EPIC-2"]);
    expect(runs[0].tasks.map((t) => t.id)).toEqual(["a"]);
    expect(runs[1].tasks.map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("reports a run with no rows rather than hiding it", async () => {
    // A child run holding nothing can never close, so the parent row waits for ever. The panel
    // says so out loud; returning the run empty is what lets it.
    state.runs = [{ id: "r1", state: "open", subject_key: null, opened_at: "2026-09-21" }];

    const runs = await childRunsOf(actor, "t1");

    expect(runs).toHaveLength(1);
    expect(runs[0].tasks).toEqual([]);
  });
});
