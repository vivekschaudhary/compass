import { describe, expect, it, vi, beforeEach } from "vitest";

// A workflow another workflow's row nests is not a phase anyone starts on its own.
//
// This failed quietly on the live engagement. Sprint 0's `Timeline & Milestones` row nests the
// `timeline` workflow; pressing Start on the card opened the child run correctly. But `phasesFor`
// reads state from TOP-LEVEL runs only, and a nested run has a parent — so the workflow list went
// on offering `timeline` as available, it was started again from there, and the second run was a
// duplicate that could never satisfy the parent row. One deliverable, three tickets.
//
// Nothing errored at any point. The only symptom was a workflow that looked startable.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const state: { workflows: Row[]; runs: Row[]; unticketed: Row[]; steps: Row[] } = {
  workflows: [], runs: [], unticketed: [], steps: [],
};

/** Runs filtered the way `nestedByOpenRun` filters them: everything not closed. */
const openRuns = () => state.runs.filter((r) => r.state !== "closed");

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      // `phasesFor` asks `workflow_run` twice with different filters — every run for the nesting
      // question, top-level runs only for the state. The fake distinguishes them by the filter
      // actually called, because answering both with the same rows would hide exactly the bug
      // this file is about.
      let topLevelOnly = false;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => { topLevelOnly = true; return chain; },
        neq: () => chain,
        not: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: null }),
        then: (res: (v: { data: Row[] }) => unknown) =>
          res({
            data: table === "workflow" ? state.workflows
              : table === "workflow_run"
                ? (topLevelOnly ? state.runs.filter((r) => !r.parent_task_id) : openRuns())
                : table === "workflow_step" ? state.steps
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

const wf = (id: string, code: string) => ({ id, code, label: code, repeatable: false });

const run = (
  workflowId: string,
  s: string,
  over: Row = {},
) => ({
  id: `r-${workflowId}`, workflow_id: workflowId, state: s, ticket_key: "CT-1",
  opened_at: "2026-09-21", workflow_version_id: `v-${workflowId}`, parent_task_id: null,
  ...over,
});

const codes = async () => (await phasesFor(ACTOR)).map((p) => p.code);

beforeEach(() => { state.workflows = []; state.runs = []; state.unticketed = []; state.steps = []; });

describe("a workflow nested by an open run", () => {
  beforeEach(() => {
    state.workflows = [wf("w-sprint0", "sprint-0"), wf("w-timeline", "timeline")];
    state.runs = [run("w-sprint0", "open")];
    state.steps = [{ nests_workflow_code: "timeline" }];
  });

  it("is not offered as a phase", async () => {
    expect(await codes()).toEqual(["sprint-0"]);
  });

  it("comes back once the parent run has closed", async () => {
    // The exclusion is about an OPEN parent. A closed sprint 0 nests nothing that is still running,
    // so the workflow is a phase again — otherwise the filter would be a one-way door.
    state.runs = [run("w-sprint0", "closed")];
    state.steps = [];
    expect(await codes()).toContain("timeline");
  });

  it("is STILL listed if it already has a top-level run", async () => {
    // Hiding a workflow that has an open run of its own would take that run off the only screen
    // showing it — invisible, and with no way to close it. Filtering must not erase existing work.
    state.runs = [run("w-sprint0", "open"), run("w-timeline", "open")];
    expect(await codes()).toContain("timeline");
  });
});

describe("an ordinary workflow", () => {
  it("is untouched by the filter", async () => {
    state.workflows = [wf("w-sprint0", "sprint-0"), wf("w-build", "build")];
    state.runs = [run("w-sprint0", "open")];
    state.steps = [{ nests_workflow_code: "timeline" }];

    // `build` is nested by nothing, so it stays available — the change must not narrow rows it
    // does not name.
    expect(await codes()).toContain("build");
  });

  it("is listed when nothing is running at all", async () => {
    state.workflows = [wf("w-timeline", "timeline")];
    expect(await codes()).toEqual(["timeline"]);
  });
});
