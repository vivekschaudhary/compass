import { describe, it, expect, vi, beforeEach } from "vitest";

// The two refusals the template contract rests on:
//
//   1. a row that DECLARES a template which resolves to nothing must not run at all
//   2. a draft missing one of the template's sections must not be FILED
//
// Both are about what does NOT happen, so the assertions are on the absence of a host dispatch and
// the absence of a `file_document` call. A test that only checked the returned message would pass
// while the document was filed anyway.

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

/** Calls that reached the database, so a test can assert one did NOT happen. */
const rpcCalls: string[] = [];
const turns: string[] = [];

vi.mock("../supabase", () => ({
  must: (_what: string, r: { data: unknown }) => r.data,
  supabaseAdmin: () => ({
    from: (table: string) => {
      const q = {
        select: () => q, eq: () => q, is: () => q, in: () => q, order: () => q, limit: () => q,
        update: () => q, insert: (rows: unknown) => { turns.push(JSON.stringify(rows)); return q; },
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
    rpc: async (name: string) => {
      rpcCalls.push(name);
      return { data: "version1", error: null };
    },
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
const { parseTemplate } = await import("../render/template");

const SOW = parseTemplate(`# SOW

## 1. Purpose

why

## 2. Scope of Work

what

## 3. Deliverables

which
`);

const ctx = (over: Record<string, unknown> = {}) => ({
  taskId: "t1", engagementId: "e1", taskTitle: "File the SOW", taskSubtitle: "",
  roleCode: "pmo-analyst", agentFile: "# Agent", produces: "02-scope/sow",
  unresolvedProduces: null, destination: "docs", output: null, inputs: [],
  doneCriteria: [], inventory: [], phaseRows: [],
  template: { name: "sow", tier: "default", body: "x", ...SOW },
  templateName: "sow",
  priorDraft: null, rejections: [], sprint: null,
  ...over,
});

const actor = { engagementId: "e1", orgId: "org1", roleCode: "pmo-analyst", holder: "Sam", scope: "mine" };

const drafted = (headings: string[]) => ({
  stopReason: "tool_use", refusalExplanation: null, text: "",
  toolCall: {
    name: "draft",
    input: {
      summary: "done",
      sections: headings.map((h) => ({ heading: h, body: "body", cites: [] })),
    },
  },
  usage: null,
});

beforeEach(() => {
  rpcCalls.length = 0; turns.length = 0;
  dispatch.mockReset(); buildContext.mockReset();
  process.env.ANTHROPIC_API_KEY = "test";
});

describe("a declared template that does not resolve", () => {
  it("halts BEFORE the model runs", async () => {
    buildContext.mockResolvedValue(ctx({ template: null, templateName: "sow" }));

    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("error");
    expect((out as { message: string }).message).toContain("sow");
    // The point of checking early: a misconfigured row must cost no model time.
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("runs normally when the row declares NO template — free-form is legitimate", async () => {
    buildContext.mockResolvedValue(ctx({ template: null, templateName: null }));
    dispatch.mockResolvedValue(drafted(["Anything", "At All"]));

    const out = await runAgent(actor as never, "t1");

    expect(dispatch).toHaveBeenCalled();
    expect(out.kind).toBe("drafted");
    expect(rpcCalls).toContain("file_document");
  });
});

describe("the floor, at filing time", () => {
  it("files a draft that covers every template section", async () => {
    buildContext.mockResolvedValue(ctx());
    dispatch.mockResolvedValue(drafted(["1. Purpose", "2. Scope of Work", "3. Deliverables"]));

    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("drafted");
    expect(rpcCalls).toContain("file_document");
  });

  it("accepts a draft that drops the template's numbering", async () => {
    buildContext.mockResolvedValue(ctx());
    dispatch.mockResolvedValue(drafted(["Purpose", "Scope of Work", "Deliverables"]));

    expect((await runAgent(actor as never, "t1")).kind).toBe("drafted");
    expect(rpcCalls).toContain("file_document");
  });

  it("accepts EXTRA sections — the template is a floor, not a cast", async () => {
    buildContext.mockResolvedValue(ctx());
    dispatch.mockResolvedValue(
      drafted(["Purpose", "Assumptions", "Scope of Work", "Deliverables", "Open Questions"]),
    );

    expect((await runAgent(actor as never, "t1")).kind).toBe("drafted");
    expect(rpcCalls).toContain("file_document");
  });

  it("REFUSES a draft missing a section, and files nothing", async () => {
    buildContext.mockResolvedValue(ctx());
    dispatch.mockResolvedValue(drafted(["Purpose", "Deliverables"]));

    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("error");
    // Named, so the model can fix it and the human can see why nothing appeared.
    expect((out as { message: string }).message).toContain("2. Scope of Work");
    // The assertion that matters: a half-written deliverable must not reach its path, where its
    // Done criterion — "a document is published at this path" — would pass on it.
    expect(rpcCalls).not.toContain("file_document");
  });

  it("writes the missing sections into the conversation, not only into the return value", async () => {
    buildContext.mockResolvedValue(ctx());
    dispatch.mockResolvedValue(drafted(["Purpose"]));

    await runAgent(actor as never, "t1");

    const said = turns.join("\n");
    expect(said).toContain("2. Scope of Work");
    expect(said).toContain("3. Deliverables");
  });
});
