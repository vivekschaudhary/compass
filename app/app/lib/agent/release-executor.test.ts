import { describe, it, expect, vi, beforeEach } from "vitest";

// The retry bookkeeping `releaseExecutor` does on every completion/failure path — see run.ts.
//
// A failure must be COUNTED and BACKED OFF, so the sweep (a later piece of this work) can tell "try
// again soon" from "give up on this one for now" without re-deriving it. A success must RESET that
// count to zero, so a row that finally goes through doesn't carry a stale attempt number into its
// next real run. And past the attempt ceiling, retrying must STOP and say so loudly — a row nobody
// will ever see succeed must not look identical to one quietly working its way through (rule 11).

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

/** The one `work_task` row every test in this file works against. */
let workTaskRow: {
  state: string; executor: string | null; run_attempts: number; next_attempt_at: string | null;
};
const emitted: { verb: string; payload: unknown }[] = [];

function workTaskTable() {
  let pendingPatch: Record<string, unknown> | null = null;
  let requireExecutorNull = false;
  const q: {
    select: () => typeof q;
    eq: () => typeof q;
    order: () => typeof q;
    limit: () => typeof q;
    in: () => typeof q;
    is: (col: string, val: unknown) => typeof q;
    update: (patch: Record<string, unknown>) => typeof q;
    maybeSingle: () => Promise<{ data: unknown; error: null }>;
    then: (resolve: (v: { data: unknown; error: null }) => void) => void;
  } = {
    select: () => q,
    eq: () => q,
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
    // A plain read — `releaseExecutor`'s own `.select("run_attempts").eq(...).maybeSingle()`.
    maybeSingle: async () => ({ data: { ...workTaskRow }, error: null }),
    // Resolves the CLAIM chain: `.update(...).eq(...).is("executor", null).select("id")`, awaited
    // directly rather than through `.maybeSingle()`. Only applies the patch if the CAS would pass.
    then: (resolve) => {
      if (!pendingPatch) return resolve({ data: [], error: null });
      const wasClaimable = workTaskRow.executor === null;
      const passes = !requireExecutorNull || wasClaimable;
      if (passes) Object.assign(workTaskRow, pendingPatch);
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
          insert: (row: { verb: string; payload: unknown }) => {
            emitted.push(row);
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
  // `state: "running"` — every test here exercises what happens once a run is already under way;
  // `runAgent`'s own new guard (it only proceeds on a `running` row, per the incident that left a
  // real task claimed forever with its state stuck at `idle`) would otherwise refuse before any of
  // this file's actual subject — the claim/release/backoff bookkeeping — ever ran.
  workTaskRow = { state: "running", executor: null, run_attempts: 0, next_attempt_at: null };
  emitted.length = 0;
  dispatch.mockReset();
  buildContext.mockReset();
  buildContext.mockResolvedValue(ctx);
  process.env.ANTHROPIC_API_KEY = "test";
});

describe("a failed run", () => {
  it("counts the attempt and sets a backoff, leaving executor cleared", async () => {
    dispatch.mockRejectedValue(new Error("host unavailable"));

    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("error");
    expect(workTaskRow.executor).toBeNull();
    expect(workTaskRow.run_attempts).toBe(1);
    expect(workTaskRow.next_attempt_at).not.toBeNull();
  });

  it("backs off further on a second consecutive failure", async () => {
    dispatch.mockRejectedValue(new Error("host unavailable"));
    await runAgent(actor as never, "t1");
    const firstBackoff = new Date(workTaskRow.next_attempt_at!).getTime() - Date.now();

    workTaskRow.executor = null; // the sweep would have re-claimed it for a second attempt
    await runAgent(actor as never, "t1");
    const secondBackoff = new Date(workTaskRow.next_attempt_at!).getTime() - Date.now();

    expect(workTaskRow.run_attempts).toBe(2);
    expect(secondBackoff).toBeGreaterThan(firstBackoff);
  });

  it("stops retrying and emits task.run_exhausted past the attempt ceiling", async () => {
    dispatch.mockRejectedValue(new Error("host unavailable"));
    for (let i = 0; i < 6; i++) {
      workTaskRow.executor = null;
      await runAgent(actor as never, "t1");
    }

    expect(workTaskRow.next_attempt_at).toBeNull();
    expect(emitted.some((e) => e.verb === "task.run_exhausted")).toBe(true);
  });
});

describe("a successful run", () => {
  it("resets run_attempts, even after prior failures", async () => {
    workTaskRow.run_attempts = 3;
    workTaskRow.next_attempt_at = new Date(Date.now() + 60_000).toISOString();
    dispatch.mockResolvedValue(drafted);

    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("drafted");
    expect(workTaskRow.run_attempts).toBe(0);
    expect(workTaskRow.next_attempt_at).toBeNull();
  });
});
