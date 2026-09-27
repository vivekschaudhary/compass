import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// `withHeartbeat` — the row's `heartbeat_at` stays fresh for as long as the model call is actually
// in flight, and stops the instant it resolves or throws. This is the other half of the stuck-run
// fix: `run_heartbeat.sql`'s sweep only knows a claim is abandoned because THIS keeps a live one
// from ever looking abandoned in the first place.

vi.mock("server-only", () => ({}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
vi.mock("../data/publish", () => ({ publishToDocs: async () => ({ ok: true, url: null, id: null }) }));
vi.mock("../data/tracker", () => ({ mirrorState: async () => ({ ok: true }) }));
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

let workTaskRow: {
  state: string; executor: string | null; run_attempts: number; next_attempt_at: string | null;
  heartbeat_at: string | null;
};
const heartbeatTouches: string[] = [];

function workTaskTable() {
  let pendingPatch: Record<string, unknown> | null = null;
  let requireExecutorNull = false;
  let requireExecutorApp = false;
  const q: {
    select: () => typeof q;
    eq: (col: string, val: unknown) => typeof q;
    order: () => typeof q;
    limit: () => typeof q;
    in: () => typeof q;
    is: (col: string, val: unknown) => typeof q;
    update: (patch: Record<string, unknown>) => typeof q;
    maybeSingle: () => Promise<{ data: unknown; error: null }>;
    then: (resolve: (v: { data: unknown; error: null }) => void) => void;
  } = {
    select: () => q,
    eq: (col, val) => {
      if (col === "executor" && val === "app") requireExecutorApp = true;
      return q;
    },
    order: () => q,
    limit: () => q,
    in: () => q,
    is: (col, val) => {
      if (col === "executor" && val === null) requireExecutorNull = true;
      return q;
    },
    update: (patch) => {
      pendingPatch = patch;
      return q;
    },
    maybeSingle: async () => ({ data: { ...workTaskRow }, error: null }),
    then: (resolve) => {
      if (!pendingPatch) return resolve({ data: [], error: null });
      const patch = pendingPatch;
      const claimable = !requireExecutorNull || workTaskRow.executor === null;
      const stillHeld = !requireExecutorApp || workTaskRow.executor === "app";
      const passes = claimable && stillHeld;
      if (passes) {
        Object.assign(workTaskRow, patch);
        if ("heartbeat_at" in patch && requireExecutorApp) {
          heartbeatTouches.push(patch.heartbeat_at as string);
        }
      }
      resolve({ data: passes ? [{ id: "t1" }] : [], error: null });
    },
  };
  return q;
}

vi.mock("../supabase", () => ({
  must: (_w: string, r: { data: unknown }) => r.data,
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "work_task") return workTaskTable();
      if (table === "event") {
        return {
          insert: (row: unknown) => {
            void row;
            return { then: (res: (v: unknown) => void) => res({ data: null, error: null }) };
          },
        };
      }
      const q: {
        select: () => typeof q; eq: () => typeof q; is: () => typeof q; in: () => typeof q;
        order: () => typeof q; limit: () => typeof q; update: () => typeof q; insert: () => typeof q;
        maybeSingle: () => Promise<{ data: unknown; error: null }>;
        single: () => Promise<{ data: unknown; error: null }>;
        then: (res: (v: { data: unknown; error: null }) => void) => void;
      } = {
        select: () => q, eq: () => q, is: () => q, in: () => q, order: () => q, limit: () => q,
        update: () => q, insert: () => q,
        maybeSingle: async () => ({ data: { org_id: "org1" }, error: null }),
        single: async () => ({ data: { id: "turn1" }, error: null }),
        then: (res) => res({ data: [], error: null }),
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

const drafted = {
  stopReason: "tool_use", refusalExplanation: null, text: "",
  toolCall: { name: "draft", input: { summary: "ok", sections: [{ heading: "H", body: "b", cites: [] }] } },
  usage: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  workTaskRow = {
    state: "running", executor: null, run_attempts: 0, next_attempt_at: null, heartbeat_at: null,
  };
  heartbeatTouches.length = 0;
  dispatch.mockReset();
  buildContext.mockReset();
  buildContext.mockResolvedValue(ctx);
  process.env.ANTHROPIC_API_KEY = "test";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withHeartbeat, via runAgent's own dispatch call", () => {
  it("sets heartbeat_at at claim, before the model call even starts", async () => {
    dispatch.mockResolvedValue(drafted);
    await runAgent(actor as never, "t1");
    expect(workTaskRow.heartbeat_at).not.toBeNull();
  });

  it("touches heartbeat_at repeatedly while a slow call is still in flight", async () => {
    let resolveDispatch: (v: typeof drafted) => void;
    dispatch.mockImplementation(
      () => new Promise((resolve) => { resolveDispatch = resolve; }),
    );

    const runPromise = runAgent(actor as never, "t1");
    // Let the claim + the first tick of setInterval land.
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.advanceTimersByTimeAsync(20_000);

    // Three ticks, plus the claim's own initial timestamp — the call is still open, so all of them
    // must have been accepted (the mock's CAS requires `executor` to still read 'app').
    expect(heartbeatTouches.length).toBeGreaterThanOrEqual(3);
    expect(workTaskRow.executor).toBe("app");

    resolveDispatch!(drafted);
    await runPromise;
  });

  it("stops touching once the call resolves", async () => {
    dispatch.mockResolvedValue(drafted);
    await runAgent(actor as never, "t1");
    const countAtFinish = heartbeatTouches.length;

    await vi.advanceTimersByTimeAsync(60_000);

    // The interval was cleared in `withHeartbeat`'s `finally` — nothing more arrives after the call
    // itself finished, however long fake time keeps moving.
    expect(heartbeatTouches.length).toBe(countAtFinish);
  });

  it("stops touching once the call rejects, not just on success", async () => {
    dispatch.mockRejectedValue(new Error("host unavailable"));
    await runAgent(actor as never, "t1");
    const countAtFinish = heartbeatTouches.length;

    await vi.advanceTimersByTimeAsync(60_000);

    expect(heartbeatTouches.length).toBe(countAtFinish);
  });
});
