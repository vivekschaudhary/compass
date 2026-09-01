import { describe, expect, it, vi, beforeEach } from "vitest";

// A phase that runs more than once.
//
// `sprint` repeats and every other phase runs once, and until now neither half worked: `phasesFor`
// reported a closed run as "closed" forever, so once sprint 1 finished the button never came back
// and the queue simply looked like the engagement had stopped sprinting. The failure is quiet by
// construction — nothing errors, a screen just stops offering something.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const state: { workflows: Row[]; runs: Row[]; unticketed: Row[] } = {
  workflows: [], runs: [], unticketed: [],
};

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        // `phasesFor` orders runs newest-first; the fake returns them as given, so a test that
        // wants "newest first" must say so in its fixture — the same contract the query has.
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: null }),
        then: (res: (v: { data: Row[] }) => unknown) =>
          res({
            data: table === "workflow" ? state.workflows
              : table === "workflow_run" ? state.runs
              : state.unticketed,
          }),
      };
      return chain;
    },
  }),
}));

vi.mock("./events", () => ({
  orgIdFor: async () => "org-1", emit: async () => {}, emitRefusal: async () => {},
}));
vi.mock("./gates", () => ({
  measureTask: async () => [], storedStatusFor: async () => null,
  evaluate: async () => ({ state: "satisfied", source: "x", detail: "" }),
}));
vi.mock("./tracker", () => ({ mirrorPhase: async () => ({ epic: null, stories: [], expected: 0, problems: [] }) }));
vi.mock("./ticket-body", () => ({ composeTicketBodies: async () => ({ written: [], expected: 0, problems: [] }) }));
vi.mock("./steps", () => ({ sortByStep: <T,>(x: T[]) => x }));

const { phasesFor } = await import("./phases");

const ACTOR = {
  orgId: "org-1", engagementId: "e1", roleCode: "delivery-manager", roleLabel: "DM",
  holder: null, scope: "everyone" as const, workstreamCode: null, agent: null,
  tier: "oversight", capabilities: [],
};

const wf = (id: string, code: string, repeatable: boolean) =>
  ({ id, code, label: code, repeatable });
const run = (workflowId: string, s: string, openedAt: string, ticket = "KAN-1") =>
  ({ id: `r-${workflowId}-${openedAt}`, workflow_id: workflowId, state: s, ticket_key: ticket, opened_at: openedAt });

beforeEach(() => { state.workflows = []; state.runs = []; state.unticketed = []; });

const stateOf = async (code: string) => (await phasesFor(ACTOR)).find((p) => p.code === code)?.state;

describe("a phase that repeats", () => {
  it("is available when it has never run", async () => {
    state.workflows = [wf("w1", "sprint", true)];
    expect(await stateOf("sprint")).toBe("available");
  });

  it("is open while a run is in flight — one sprint at a time", async () => {
    state.workflows = [wf("w1", "sprint", true)];
    state.runs = [run("w1", "open", "2026-08-01")];
    expect(await stateOf("sprint")).toBe("open");
  });

  // THE BUG. Sprint 1 closes and sprint 2 has to be startable, or the cycle is a single pass.
  it("becomes available again once its run has closed", async () => {
    state.workflows = [wf("w1", "sprint", true)];
    state.runs = [run("w1", "closed", "2026-08-01")];
    expect(await stateOf("sprint")).toBe("available");
  });

  // Ordered newest-first by the query. Reading the wrong one reports a finished sprint while one
  // is actually in flight — and offers to start a third.
  it("reads the LATEST run, not whichever came back first", async () => {
    state.workflows = [wf("w1", "sprint", true)];
    state.runs = [run("w1", "open", "2026-09-01"), run("w1", "closed", "2026-08-01")];
    expect(await stateOf("sprint")).toBe("open");
  });

  it("stays available across many finished sprints", async () => {
    state.workflows = [wf("w1", "sprint", true)];
    state.runs = [
      run("w1", "closed", "2026-09-01"), run("w1", "closed", "2026-08-15"), run("w1", "closed", "2026-08-01"),
    ];
    expect(await stateOf("sprint")).toBe("available");
  });
});

describe("a phase that does not", () => {
  // The other direction matters as much: sprint 0 offering to run again would invite someone to
  // re-file the SOW and redraft the brief over a live engagement.
  it("stays closed once it has finished", async () => {
    state.workflows = [wf("w2", "sprint-0", false)];
    state.runs = [run("w2", "closed", "2026-08-01")];
    expect(await stateOf("sprint-0")).toBe("closed");
  });

  it("is still open while it runs", async () => {
    state.workflows = [wf("w2", "sprint-0", false)];
    state.runs = [run("w2", "open", "2026-08-01")];
    expect(await stateOf("sprint-0")).toBe("open");
  });

  // Read from the workflow's own column, never tested against `code === "sprint"`. A checker that
  // carries the literal it polices is a mistake this repo has already paid for once.
  it("repeats on the strength of the column, whatever it is called", async () => {
    state.workflows = [wf("w3", "some-future-cadence", true)];
    state.runs = [run("w3", "closed", "2026-08-01")];
    expect(await stateOf("some-future-cadence")).toBe("available");
  });
});
