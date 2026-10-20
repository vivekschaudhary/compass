import { describe, it, expect, vi, beforeEach } from "vitest";

// A refine-stories row files one epic's stories as structure, not as prose that happens to look like
// stories. What is asserted is what gets FILED and what gets RECORDED as rows — a test over the
// returned message would pass on a run that produced nothing a board could use.

vi.mock("server-only", () => ({}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
const publishToDocs = vi.fn<(...a: unknown[]) => Promise<{ ok: true; url: null; id: null }>>(async () => ({ ok: true, url: null, id: null }));
vi.mock("../data/publish", () => ({ publishToDocs: (...a: unknown[]) => publishToDocs(...a) }));
vi.mock("../data/tracker", () => ({ mirrorState: async () => ({ ok: true }) }));
vi.mock("../data/events", () => ({ emit: async () => {} }));
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
const existingStories = vi.fn<(...a: unknown[]) => Promise<unknown[]>>(async () => []);
const recordStories = vi.fn<(...a: unknown[]) => Promise<{ written: number; problems: string[] }>>(async () => ({ written: 0, problems: [] }));
vi.mock("../data/stories", async () => {
  const real = await vi.importActual<typeof import("../data/stories")>("../data/stories");
  return {
    ...real,
    existingStoriesOf: (...a: unknown[]) => existingStories(...a),
    recordStories: (...a: unknown[]) => recordStories(...a),
  };
});
vi.mock("../data/gates", () => ({ measureTask: async () => [], approve: async () => ({ ok: true }) }));
vi.mock("../data/job", () => ({ conversation: async () => [], openQuestions: async () => [] }));

/** The sections handed to `file_document` — what the roster actually becomes. */
let filed: { heading: string; body: string }[] | null = null;
const turns: string[] = [];

vi.mock("../supabase", () => ({
  must: (_w: string, r: { data: unknown }) => r.data,
  supabaseAdmin: () => ({
    from: (table: string) => {
      const q = {
        select: () => q, eq: () => q, is: () => q, in: () => q, order: () => q, limit: () => q,
        update: () => q,
        insert: (rows: Record<string, unknown>[] | Record<string, unknown>) => {
          const list = Array.isArray(rows) ? rows : [rows];
          if (table === "turn") turns.push(String(list[0]?.body ?? ""));
          return q;
        },
        // `state: "running"` satisfies `runAgent`'s own guard that the row was actually started
        // before it claims the executor — not what this file is testing.
        maybeSingle: async () => ({ data: { org_id: "org1", state: "running" } }),
        single: async () => ({ data: { id: "turn1" }, error: null }),
        // `runAgent` claims `work_task.executor` with `.update(...).is("executor", null).select("id")`
        // before dispatching — every row here starts unclaimed, so that claim must succeed.
        then: (res: (v: { data: unknown; error: null }) => void) =>
          res({ data: table === "work_task" ? [{ id: "t1" }] : [], error: null }),
      };
      return q;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "file_document") {
        filed = args.p_sections as { heading: string; body: string }[];
      }
      return { data: "v1", error: null };
    },
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
    revisionPrompt: () => null,
  };
});

const { runAgent } = await import("./run");

const actor = {
  engagementId: "e1", orgId: "org1", roleCode: "product-owner", holder: "Om", scope: "mine",
};

/** The refine-stories drafting row, as the DB declares it: `output: stories`, one epic's page. */
const ctx = {
  taskId: "t1", engagementId: "e1", taskTitle: "Create stories for an epic — ACC-E1 Sign-in", taskSubtitle: "",
  roleCode: "product-owner", agentFile: "# Agent", produces: "stories/CT-288",
  unresolvedProduces: null, destination: "docs", output: "stories", inputs: [],
  doneCriteria: [], inventory: [], phaseRows: [],
  template: null, templateName: null, priorDraft: null, rejections: [], sprint: null,
  stories: { epic: { ref: "ACC-E1", title: "Sign-in", body: "b", ticketKey: "CT-288" }, existing: [] },
};

const story = (over: Record<string, unknown> = {}) => ({
  title: "Sign in with Apple", description: "As a member I can sign in with Apple.",
  acceptance_criteria: ["An account is created"], notes: "None.", cites: ["features"], ...over,
});

const storiesCall = (stories: unknown) => ({
  stopReason: "tool_use", refusalExplanation: null, text: "",
  toolCall: { name: "stories", input: { summary: "Drafted stories.", stories } },
  usage: null,
});

beforeEach(() => {
  filed = null;
  turns.length = 0;
  buildContext.mockReset();
  buildContext.mockResolvedValue(ctx);
  dispatch.mockReset();
  existingStories.mockReset().mockResolvedValue([]);
  recordStories.mockReset().mockResolvedValue({ written: 0, problems: [] });
  publishToDocs.mockClear();
  process.env.ANTHROPIC_API_KEY = "test";
});

describe("the stories tool", () => {
  it("files one section per story, headed by its ref, with the standard body", async () => {
    dispatch.mockResolvedValue(storiesCall([story(), story({ title: "Sign up with email" })]));
    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("drafted");
    expect(filed?.map((s) => s.heading)).toEqual([
      "ACC-E1-S1 — Sign in with Apple",
      "ACC-E1-S2 — Sign up with email",
    ]);
    expect(filed?.[0].body).toContain("## Acceptance criteria\n- An account is created");
  });

  it("records only the stories THIS run added, under the epic", async () => {
    dispatch.mockResolvedValue(storiesCall([story()]));
    await runAgent(actor as never, "t1");

    expect(recordStories).toHaveBeenCalledTimes(1);
    const [, , taskId, epicRef, added] = recordStories.mock.calls[0] as [string, string, string, string, { ref: string }[]];
    expect([taskId, epicRef, added.map((a) => a.ref)]).toEqual(["t1", "ACC-E1", ["ACC-E1-S1"]]);
  });

  it("carries the stories the epic already had, untouched, ahead of the new one", async () => {
    existingStories.mockResolvedValue([
      { ref: "ACC-E1-S1", title: "Sign in with Apple", body: "## Description\nold body", ticketKey: "CT-310", ord: 0 },
    ]);
    dispatch.mockResolvedValue(storiesCall([story({ title: "Reset a forgotten password" })]));
    await runAgent(actor as never, "t1");

    expect(filed?.map((s) => s.heading)).toEqual([
      "ACC-E1-S1 — Sign in with Apple",
      "ACC-E1-S2 — Reset a forgotten password",
    ]);
    expect(filed?.[0].body).toBe("## Description\nold body");
  });

  it("publishes the page — the epic's stories are for people who never open Compass", async () => {
    dispatch.mockResolvedValue(storiesCall([story()]));
    await runAgent(actor as never, "t1");
    expect(publishToDocs).toHaveBeenCalledTimes(1);
  });

  it("tells the approver what was dropped", async () => {
    dispatch.mockResolvedValue(storiesCall([story(), story({ title: "No criteria", acceptance_criteria: [] })]));
    await runAgent(actor as never, "t1");
    expect(turns.join("\n")).toMatch(/Reading the stories[\s\S]*No criteria[\s\S]*no acceptance criteria/);
    expect(filed).toHaveLength(1);
  });
});

describe("a run that adds nothing", () => {
  it("files nothing and writes no rows when every story is dropped, and says why", async () => {
    dispatch.mockResolvedValue(storiesCall([story({ acceptance_criteria: [] })]));
    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("error");
    expect(filed).toBeNull();
    expect(recordStories).not.toHaveBeenCalled();
    expect(turns.join("\n")).toMatch(/No document was produced[\s\S]*Every story it drafted was dropped/);
  });

  it("does not tell you to run it again when the epic is simply covered", async () => {
    existingStories.mockResolvedValue([
      { ref: "ACC-E1-S1", title: "Sign in with Apple", body: "b", ticketKey: "CT-310", ord: 0 },
    ]);
    dispatch.mockResolvedValue(storiesCall([]));
    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("error");
    expect(filed).toBeNull();
    const said = turns.join("\n");
    expect(said).toMatch(/already has 1 stories/);
    expect(said).not.toMatch(/Running again usually resolves it/);
  });

  it("repeating an existing title adds nothing and re-files nothing", async () => {
    existingStories.mockResolvedValue([
      { ref: "ACC-E1-S1", title: "Sign in with Apple", body: "b", ticketKey: "CT-310", ord: 0 },
    ]);
    dispatch.mockResolvedValue(storiesCall([story()]));
    await runAgent(actor as never, "t1");
    expect(filed).toBeNull();
    expect(recordStories).not.toHaveBeenCalled();
  });
});

describe("a run with no epic", () => {
  it("refuses before filing anything", async () => {
    buildContext.mockResolvedValue({ ...ctx, stories: null });
    dispatch.mockResolvedValue(storiesCall([story()]));
    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("error");
    expect(out.kind === "error" && out.message).toMatch(/no epic to draft stories for/);
    expect(filed).toBeNull();
  });
});
