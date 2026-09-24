import { describe, it, expect, vi, beforeEach } from "vitest";

// `unmetToStart`'s own DB-fetching half — `blockersFrom`/`describeBlockers` (start-gate.test.ts)
// cover the decision once the inputs are known; this covers gathering those inputs correctly:
// finding the task's step, skipping ad-hoc rows entirely, and resolving `depends_on` siblings
// scoped to the right run. Same database-mocking shape `nested-gate.test.ts` already uses.

vi.mock("server-only", () => ({}));

type TaskRow = {
  id: string;
  workflow_run_id: string | null;
  workflow_step: {
    task: string;
    depends_on: string[] | null;
    workflow_version_id: string;
  } | null;
};

const state: {
  task: TaskRow | null;
  steps: { id: string; title: string; ord: number }[];
  siblingTasks: { workflow_step_id: string; state: string }[];
  measured: { id: string; kind: "ready" | "done"; statement: string; verdict: unknown }[];
} = { task: null, steps: [], siblingTasks: [], measured: [] };

vi.mock("./gates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./gates")>()),
  measureTask: async () => state.measured,
}));

vi.mock("../supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../supabase")>()),
  supabaseAdmin: () => ({
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        maybeSingle: async () => ({ data: state.task }),
        then: (resolve: (r: { data: unknown[] }) => void) => {
          if (table === "workflow_step") return resolve({ data: state.steps });
          if (table === "work_task") return resolve({ data: state.siblingTasks });
          return resolve({ data: [] });
        },
      };
      return chain;
    },
  }),
}));

const { unmetToStart } = await import("./start-gate");
const actor = { engagementId: "eng", orgId: "org", roleCode: "delivery-manager" } as never;

beforeEach(() => {
  state.task = null;
  state.steps = [];
  state.siblingTasks = [];
  state.measured = [];
});

describe("unmetToStart", () => {
  it("has no gate at all for ad-hoc work — no workflow_step on the task", async () => {
    state.task = { id: "t1", workflow_run_id: "r1", workflow_step: null };
    const blockers = await unmetToStart(actor, "t1");
    expect(blockers).toEqual([]);
  });

  it("has no gate when the task is not found", async () => {
    state.task = null;
    const blockers = await unmetToStart(actor, "missing");
    expect(blockers).toEqual([]);
  });

  it("is clear to start when Ready is satisfied and depends_on names nothing", async () => {
    state.task = {
      id: "t1", workflow_run_id: "r1",
      workflow_step: { task: "draft-timeline", depends_on: [], workflow_version_id: "v1" },
    };
    state.measured = [
      { id: "c1", kind: "ready", statement: "SOW filed", verdict: { state: "satisfied" } },
    ];
    const blockers = await unmetToStart(actor, "t1");
    expect(blockers).toEqual([]);
  });

  it("blocks on an unclosed dependency, scoped to this run's siblings", async () => {
    state.task = {
      id: "t2", workflow_run_id: "r1",
      workflow_step: {
        task: "draft-resources", depends_on: ["draft-timeline"], workflow_version_id: "v1",
      },
    };
    state.steps = [{ id: "step-timeline", title: "Timeline & Milestones", ord: 2 }];
    state.siblingTasks = [{ workflow_step_id: "step-timeline", state: "idle" }];
    const blockers = await unmetToStart(actor, "t2");
    expect(blockers).toEqual([{ kind: "depends_on", label: "Timeline & Milestones" }]);
  });

  it("is not blocked once the dependency's task in THIS run has closed", async () => {
    state.task = {
      id: "t2", workflow_run_id: "r1",
      workflow_step: {
        task: "draft-resources", depends_on: ["draft-timeline"], workflow_version_id: "v1",
      },
    };
    state.steps = [{ id: "step-timeline", title: "Timeline & Milestones", ord: 2 }];
    state.siblingTasks = [{ workflow_step_id: "step-timeline", state: "closed" }];
    const blockers = await unmetToStart(actor, "t2");
    expect(blockers).toEqual([]);
  });

  it("combines an unsatisfied Ready criterion with an open dependency", async () => {
    state.task = {
      id: "t2", workflow_run_id: "r1",
      workflow_step: {
        task: "draft-resources", depends_on: ["draft-timeline"], workflow_version_id: "v1",
      },
    };
    state.measured = [{
      id: "c1", kind: "ready", statement: "roster is staffed",
      verdict: { state: "unsatisfied", detail: "no EA" },
    }];
    state.steps = [{ id: "step-timeline", title: "Timeline & Milestones", ord: 2 }];
    state.siblingTasks = [];
    const blockers = await unmetToStart(actor, "t2");
    expect(blockers).toEqual([
      { kind: "ready", label: "roster is staffed (not met: no EA)" },
      { kind: "depends_on", label: "Timeline & Milestones" },
    ]);
  });
});
