import { describe, it, expect, vi, beforeEach } from "vitest";

// Two requests must not both dispatch the model on the same row.
//
// `runAgent` marks `executor: "app"` before calling the host, and used to do it with a plain
// update — two callers hitting a freshly-started row at once could both pass every check above
// that line and both reach it, so both would dispatch. Auto-firing the run on page load, rather
// than waiting for a person to notice and click, makes two callers landing on the same row at once
// far more reachable than it was when it took two people clicking together.
//
// So the update is a CLAIM: `.is("executor", null)` means only the first caller's write matches
// any row at all. What is asserted here is that the second caller sees that — an empty result —
// and refuses before the model is ever dispatched, rather than racing ahead on a write that quietly
// did nothing.

vi.mock("server-only", () => ({}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
vi.mock("../data/publish", () => ({ publishToDocs: async () => ({ ok: true, url: null, id: null }) }));
vi.mock("../data/tracker", () => ({ mirrorState: async () => ({ ok: true }) }));
vi.mock("../data/events", () => ({ emit: async () => {} }));
vi.mock("../data/job", () => ({ conversation: async () => [], openQuestions: async () => [] }));
vi.mock("../data/phases", () => ({ nestedWorkflowOf: async () => null }));
vi.mock("../data/backlog", () => ({
  normaliseBacklog: () => ({ epics: [], problems: [] }),
  sectionsOf: () => [],
  recordBacklog: async () => ({ written: 0, problems: [] }),
}));
vi.mock("../data/sprint", () => ({ resolveCommitments: async () => ({ commitments: [], problems: [] }) }));
vi.mock("../data/sprint-rows", () => ({ commitmentsSection: () => ({}), overviewSection: () => ({}) }));
vi.mock("./code-run", () => ({ runCode: async () => ({}), storyFor: async () => null }));
vi.mock("../jira", () => ({
  jiraForEngagement: async () => null, addRemoteLink: async () => {}, addComment: async () => {},
}));

/** Whether the next claim on `work_task` finds the row still unclaimed. */
let claimSucceeds = true;
/** What `runAgent`'s own state guard reads back for the row. */
let taskState = "running";

vi.mock("../supabase", () => ({
  must: (_what: string, r: { data: unknown }) => r.data,
  supabaseAdmin: () => ({
    from: (table: string) => {
      const q = {
        select: () => q, eq: () => q, is: () => q, in: () => q, order: () => q, limit: () => q,
        update: () => q, insert: () => q,
        maybeSingle: async () => ({ data: { org_id: "org1", state: taskState } }),
        single: async () => ({ data: { id: "turn1" }, error: null }),
        then: (res: (v: { data: unknown; error: null }) => void) =>
          res({ data: table === "work_task" && claimSucceeds ? [{ id: "t1" }] : [], error: null }),
      };
      return q;
    },
    rpc: async () => ({ data: "v1", error: null }),
  }),
}));

const dispatch = vi.fn();
vi.mock("./hosts/select", () => ({ selectHost: () => ({ name: "test", dispatch }), MODEL: "m" }));
vi.mock("./hosts/tools", () => ({ toolsFor: () => [] }));

const buildContext = vi.fn();
vi.mock("./context", async () => {
  const real = await vi.importActual<typeof import("./context")>("./context");
  return {
    ...real,
    buildContext: (...a: unknown[]) => buildContext(...a),
    systemPrompt: () => "system",
    inputPrompt: () => "input",
    revisionPrompt: () => null,
  };
});

const { runAgent } = await import("./run");

const ctx = {
  taskId: "t1", engagementId: "e1", taskTitle: "Draft", taskSubtitle: "",
  roleCode: "pmo-analyst", agentFile: "# Agent", produces: "02-scope/x",
  unresolvedProduces: null, destination: "docs", output: null, inputs: [],
  doneCriteria: [], inventory: [], phaseRows: [],
  template: null, templateName: null,
  priorDraft: null, rejections: [], sprint: null,
};

const actor = { engagementId: "e1", orgId: "org1", roleCode: "pmo-analyst", holder: "Sam", scope: "mine" };

beforeEach(() => {
  claimSucceeds = true;
  taskState = "running";
  dispatch.mockReset();
  buildContext.mockReset();
  buildContext.mockResolvedValue(ctx);
  process.env.ANTHROPIC_API_KEY = "test";
});

describe("claiming a row before dispatch", () => {
  it("dispatches when the row is unclaimed", async () => {
    dispatch.mockResolvedValue({
      stopReason: "tool_use", refusalExplanation: null, text: "",
      toolCall: { name: "draft", input: { summary: "ok", sections: [{ heading: "H", body: "b", cites: [] }] } },
      usage: null,
    });

    const out = await runAgent(actor as never, "t1");

    expect(dispatch).toHaveBeenCalled();
    expect(out.kind).toBe("drafted");
  });

  it("refuses WITHOUT dispatching when another caller already claimed the row", async () => {
    claimSucceeds = false;

    const out = await runAgent(actor as never, "t1");

    expect(dispatch).not.toHaveBeenCalled();
    expect(out.kind).toBe("error");
    expect((out as { message: string }).message).toContain("already running");
  });

  // The incident this guards: a row still `idle` (never started via `start_task`) got its executor
  // claimed and dispatched anyway, then never released — invisible to the sweep, which only ever
  // looks at `state = 'running'`. `runAgent` must refuse before the claim, not after.
  it("refuses WITHOUT claiming or dispatching when the row is not running", async () => {
    taskState = "idle";

    const out = await runAgent(actor as never, "t1");

    expect(dispatch).not.toHaveBeenCalled();
    expect(out.kind).toBe("error");
    expect((out as { message: string }).message).toContain("start it first");
  });
});
