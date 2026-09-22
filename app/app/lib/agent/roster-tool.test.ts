import { describe, it, expect, vi, beforeEach } from "vitest";

// A staffing row files a table, not prose that happens to look like one.
//
// The defect this exists for: `output: roster` was the only output that must become state and had
// no tool. `toolsFor("roster")` fell through to the general set, the agent got plain `draft`, and
// the names a delivery manager gave in answers reached the page however the model felt like
// writing them — on the live engagement, not at all: three questions answered and `member` still
// empty, with nothing anywhere saying so.
//
// So what is asserted here is the SECTIONS THAT GET FILED. A test over the returned message would
// pass on a run that filed a page of prose, which is exactly the outcome that already shipped.

vi.mock("server-only", () => ({}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
vi.mock("../data/publish", () => ({ publishToDocs: async () => ({ ok: true, url: null, id: null }) }));
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
        maybeSingle: async () => ({ data: { org_id: "org1" } }),
        single: async () => ({ data: { id: "turn1" }, error: null }),
        then: (res: (v: { data: unknown; error: null }) => void) => res({ data: [], error: null }),
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
  engagementId: "e1", orgId: "org1", roleCode: "delivery-manager", holder: "Joe", scope: "mine",
};

/** The staffing row, as the seed declares it: `output: roster`, producing `resource-plan`. */
const ctx = {
  taskId: "t1", engagementId: "e1", taskTitle: "Staffing plan and resources", taskSubtitle: "",
  roleCode: "delivery-manager", agentFile: "# Agent", produces: "resource-plan",
  unresolvedProduces: null, destination: "docs", output: "roster", inputs: [],
  doneCriteria: [], inventory: [], phaseRows: [],
  template: null, templateName: null, priorDraft: null, rejections: [], sprint: null,
};

/** One `roster` tool call, as the host returns it. */
const rosterCall = (rows: unknown) => ({
  stopReason: "tool_use", refusalExplanation: null, text: "",
  toolCall: { name: "roster", input: { summary: "Staffed from the SOW.", rows, sections: [] } },
  usage: null,
});

beforeEach(() => {
  filed = null;
  turns.length = 0;
  buildContext.mockReset();
  buildContext.mockResolvedValue(ctx);
  dispatch.mockReset();
  process.env.ANTHROPIC_API_KEY = "test";
});

describe("the roster tool", () => {
  it("files the rows as a Role/Holder table", async () => {
    dispatch.mockResolvedValue(rosterCall([
      { role: "Delivery Manager", holder: "Joe" },
      { role: "Product Manager", holder: "Jill" },
    ]));

    await runAgent(actor as never, "t1");

    expect(filed).not.toBeNull();
    const table = filed!.map((s) => s.body).join("\n");
    expect(table).toContain("| Role | Holder |");
    expect(table).toContain("| Delivery Manager | Joe |");
    expect(table).toContain("| Product Manager | Jill |");
  });

  // The whole point, stated as the thing that failed: the names the human gave have to end up
  // somewhere `materialiseRoster` can read them, and that is this table.
  it("puts the table where parseRoster will find it on approval", async () => {
    dispatch.mockResolvedValue(rosterCall([{ role: "Engineer", holder: "Jay" }]));
    await runAgent(actor as never, "t1");

    const { parseRoster } = await import("../data/roster-rows");
    const markdown = filed!.map((s) => `## ${s.heading}\n${s.body}`).join("\n\n");
    expect(parseRoster(markdown)).toEqual([{ roleLabel: "Engineer", holder: "Jay" }]);
  });

  // An empty roster is not a staffing plan. It must halt rather than file a page with a header row
  // and nothing under it — which would publish, pass a `document is published` gate, and staff
  // nobody.
  it("halts rather than filing a roster with no rows", async () => {
    dispatch.mockResolvedValue(rosterCall([]));
    const out = await runAgent(actor as never, "t1");

    expect(filed).toBeNull();
    expect(out).toMatchObject({ kind: "error" });
    expect(turns.join("\n")).toContain("No document was produced");
  });

  // A dropped row reaches the human, not just a log: they are approving the roster on the strength
  // of it being complete.
  it("says in the conversation when a row was dropped", async () => {
    dispatch.mockResolvedValue(rosterCall([
      { role: "", holder: "Nobody" },
      { role: "Engineer", holder: "Jay" },
    ]));
    await runAgent(actor as never, "t1");

    expect(turns.join("\n")).toContain("Dropped row 1 with no role.");
    expect(filed!.map((s) => s.body).join("\n")).toContain("| Engineer | Jay |");
  });
});
