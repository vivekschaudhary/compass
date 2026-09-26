import { describe, it, expect, vi, beforeEach } from "vitest";

// A `doc-review`/`code-review` row's `ask` tool called with ZERO questions — the model's own way
// of saying "nothing to ask" through the only tool it has, rather than by calling no tool at all.
// Live: `stopReason: "tool_use", questions: 0`, even with the prompt explicitly saying a plain-text
// reply with no tool call is a complete turn on this kind of row (`systemPrompt`'s `askOnly`
// branch). That branch fixed the `!call` (no tool at all) door; this is the OTHER door the same
// "nothing to ask" intent arrives through, and it used to hit the generic `ask-empty` halt —
// `releaseExecutor({failed:true})` with no state change — leaving the row stuck wherever it
// happened to be (`running`), same shape as the SOW defect `supplied.test.ts` covers.

vi.mock("server-only", () => ({}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
vi.mock("../data/publish", () => ({ publishToDocs: async () => ({ ok: true, url: null, id: null }) }));
vi.mock("../data/tracker", () => ({ mirrorState: async () => ({ ok: true }) }));
vi.mock("../data/events", () => ({ emit: async () => {} }));
vi.mock("../data/phases", () => ({ nestedWorkflowOf: async () => null }));
vi.mock("../data/gates", () => ({ measureTask: async () => [], approve: async () => ({ ok: true }) }));
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

const open = vi.fn(async () => [] as unknown[]);
vi.mock("../data/job", () => ({
  conversation: async () => [],
  openQuestions: (...a: unknown[]) => open(...(a as [])),
}));

const taskPatches: Record<string, unknown>[] = [];
const turns: string[] = [];

vi.mock("../supabase", () => ({
  must: (_w: string, r: { data: unknown }) => r.data,
  supabaseAdmin: () => ({
    from: (table: string) => {
      const q = {
        select: () => q, eq: () => q, is: () => q, in: () => q, order: () => q, limit: () => q,
        update: (patch: Record<string, unknown>) => {
          if (table === "work_task") taskPatches.push(patch);
          return q;
        },
        insert: (rows: Record<string, unknown>[] | Record<string, unknown>) => {
          const list = Array.isArray(rows) ? rows : [rows];
          if (table === "turn") turns.push(String(list[0]?.body ?? ""));
          return q;
        },
        // `state: "running"` satisfies `runAgent`'s own guard that the row was actually started.
        maybeSingle: async () => ({ data: { org_id: "org1", state: "running" } }),
        single: async () => ({ data: { id: "turn1" }, error: null }),
        then: (res: (v: { data: unknown; error: null }) => void) =>
          res({ data: table === "work_task" ? [{ id: "t1" }] : [], error: null }),
      };
      return q;
    },
    rpc: async () => ({ data: "v1", error: null }),
  }),
}));

const dispatch = vi.fn();
vi.mock("./hosts/select", () => ({ selectHost: () => ({ name: "t", dispatch }), MODEL: "m" }));

const buildContext = vi.fn();
vi.mock("./context", async () => {
  const real = await vi.importActual<typeof import("./context")>("./context");
  return {
    ...real,
    buildContext: (...a: unknown[]) => buildContext(...a),
    systemPrompt: () => "system",
    inputPrompt: real.inputPrompt,
    revisionPrompt: () => null,
  };
});

const { runAgent } = await import("./run");

const actor = { engagementId: "e1", orgId: "org1", roleCode: "product-manager", holder: "Nishi", scope: "mine" };

const ctx = (over: Record<string, unknown> = {}) => ({
  taskId: "t1", engagementId: "e1", taskTitle: "Review and approve the staffing plan", taskSubtitle: "",
  roleCode: "product-manager", agentFile: "# Agent", produces: null,
  unresolvedProduces: null, renders: "doc-review", reviewPath: "resource-plan", destination: null,
  output: null, inputs: [], doneCriteria: [], inventory: [], phaseRows: [],
  template: null, templateName: null, priorDraft: null, rejections: [], sprint: null,
  ...over,
});

const emptyAsk = (preamble: string) => ({
  stopReason: "tool_use", refusalExplanation: null, text: "",
  toolCall: { name: "ask", input: { preamble, questions: [] } },
  usage: null,
});

/** The row went back to whoever is reviewing it: `hitl`, and nobody still holding it. */
const handedOver = () =>
  taskPatches.some((p) => p.state === "hitl" && p.executor === null);

beforeEach(() => {
  taskPatches.length = 0; turns.length = 0;
  dispatch.mockReset(); buildContext.mockReset();
  open.mockReset(); open.mockResolvedValue([]);
  process.env.ANTHROPIC_API_KEY = "test";
});

describe("a review row's ask called with zero questions", () => {
  it("hands the row BACK to hitl — the same ending a plain-text reply already gets", async () => {
    buildContext.mockResolvedValue(ctx());
    dispatch.mockResolvedValue(emptyAsk("The review is complete — approved on the terms above."));

    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("drafted");
    expect(handedOver()).toBe(true);
  });

  it("does the SAME for a code-review row", async () => {
    buildContext.mockResolvedValue(ctx({ renders: "code-review", reviewPath: null }));
    dispatch.mockResolvedValue(emptyAsk("Nothing further blocks this change."));

    await runAgent(actor as never, "t1");

    expect(handedOver()).toBe(true);
  });

  it("still holds the ORDINARY halt for every other row — nothing here widens who gets the pass", async () => {
    buildContext.mockResolvedValue(ctx({ renders: "doc", produces: "resource-plan" }));
    dispatch.mockResolvedValue(emptyAsk("Nothing further is needed."));

    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("error");
    expect(handedOver()).toBe(false);
  });

  it("keeps the preamble in the conversation either way", async () => {
    buildContext.mockResolvedValue(ctx());
    dispatch.mockResolvedValue(emptyAsk("The review is complete — approved on the terms above."));

    await runAgent(actor as never, "t1");

    expect(turns[0]).toContain("The review is complete");
  });
});
