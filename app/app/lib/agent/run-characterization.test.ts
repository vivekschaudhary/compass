import { describe, it, expect, vi, beforeEach } from "vitest";

// CHARACTERIZATION — what `runAgent` does today, pinned so a refactor that moves code cannot
// change it unnoticed.
//
// These tests assert the ORDER of side effects, not just the returned outcome. The other files in
// this directory each pin one guard; none pins a whole run, and the sequences below are exactly
// what a split of `runAgent` is most likely to reorder without any single guard noticing:
//
//   release → mirror → finished   (the hand-over: a row must be handed over before the board says so)
//   file → filed-event → citations → publish → supersede → hand over   (the filing pipeline)
//
// Where a sequence looks odd it is pinned anyway and flagged `QUIRK`. This file records what runs;
// it does not say what should. Changing a QUIRK is a behaviour change: do it on purpose, in its own
// commit, and rewrite the assertion rather than deleting it.

vi.mock("server-only", () => ({}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));

/** Every side effect, in the order it happened. */
let log: string[] = [];
/** What `file_document` was handed. */
let filed: { heading: string; body: string }[] | null = null;
let taskState = "running";

vi.mock("../data/publish", () => ({
  publishToDocs: async () => {
    log.push("publish");
    return { ok: true, url: "https://docs/x", id: "p1" };
  },
}));
vi.mock("../data/tracker", () => ({
  mirrorState: async (_e: string, _t: string, state: string) => {
    log.push(`mirror:${state}`);
    return { ok: true };
  },
}));
vi.mock("../data/events", () => ({
  emit: async (e: { verb: string; payload?: { outcome?: string } }) => {
    log.push(e.payload?.outcome ? `emit:${e.verb}(${e.payload.outcome})` : `emit:${e.verb}`);
  },
}));
vi.mock("../data/job", () => ({ conversation: async () => [], openQuestions: async () => [] }));
vi.mock("../data/phases", () => ({ nestedWorkflowOf: async () => null }));
vi.mock("../data/gates", () => ({ measureTask: async () => [], approve: async () => ({ ok: true }) }));
vi.mock("../data/backlog", () => ({
  normaliseBacklog: () => ({ epics: [], problems: [] }),
  sectionsOf: () => [],
  recordBacklog: async () => ({ written: 0, problems: [] }),
}));
vi.mock("../data/sprint", () => ({
  resolveCommitments: async () => ({
    commitments: [{ story: "KAN-1" }],
    problems: [],
  }),
}));
vi.mock("../data/sprint-rows", () => ({
  overviewSection: (o: { number: number }) => ({
    heading: `Sprint ${o.number} overview`, body: "o", cites: [],
  }),
  commitmentsSection: () => ({ heading: "Commitments", body: "c", cites: [] }),
}));

const runCode = vi.fn();
vi.mock("./code-run", () => ({
  runCode: (...a: unknown[]) => runCode(...a),
  storyFor: async () => null,
}));
const runScaffold = vi.fn();
vi.mock("./generate-run", () => ({
  runScaffold: (...a: unknown[]) => runScaffold(...a),
}));
vi.mock("../jira", () => ({
  jiraForEngagement: async () => null, addRemoteLink: async () => {}, addComment: async () => {},
}));

/** Label a write so the log reads as a sequence of intentions rather than raw payloads. */
function label(table: string, op: string, payload: Record<string, unknown> | undefined): string | null {
  if (op === "select") return null;
  if (table === "work_task" && op === "update") {
    if (payload && "heartbeat_at" in payload && payload.executor === "app") return "claim";
    if (payload?.executor === null) {
      if (payload.state) return `release:${payload.state}`;
      return Number(payload.run_attempts) > 0 ? "release:failed" : "release:ok";
    }
  }
  return `${table}.${op}`;
}

/** What a query returns when it is awaited directly, keyed by `table.op`. */
const rowsFor: Record<string, unknown> = {
  "work_task.update": [{ id: "t1" }],
  "question.insert": [{ id: "q1", prompt: "What is the budget?" }],
  "question.update": [{ id: "q0", prompt: "an old open question" }],
  "document_section.select": [{ id: "s1", ord: 0 }],
};

vi.mock("../supabase", () => ({
  must: (_w: string, r: { data: unknown }) => r.data,
  supabaseAdmin: () => ({
    from: (table: string) => {
      let op = "select";
      let payload: Record<string, unknown> | undefined;
      const q = {
        select: () => q, eq: () => q, is: () => q, in: () => q, order: () => q, limit: () => q,
        update: (p: Record<string, unknown>) => {
          op = "update";
          payload = p;
          const l = label(table, op, p);
          if (l) log.push(l);
          return q;
        },
        insert: (p: Record<string, unknown> | Record<string, unknown>[]) => {
          op = "insert";
          payload = Array.isArray(p) ? p[0] : p;
          const l = label(table, op, payload);
          if (l) log.push(l);
          return q;
        },
        maybeSingle: async () => {
          const data: Record<string, unknown> = {
            work_task: { state: taskState, run_attempts: 0 },
            engagement: { org_id: "org1" },
            turn: { id: "turn1" },
            document: { id: "d1" },
            document_version: { id: "v0" },
          };
          return { data: data[table] ?? null };
        },
        then: (res: (v: { data: unknown; error: null }) => void) =>
          res({ data: rowsFor[`${table}.${op}`] ?? [], error: null }),
      };
      return q;
    },
    rpc: async (name: string, args: { p_sections?: { heading: string; body: string }[] }) => {
      log.push(`rpc:${name}`);
      if (name === "file_document") filed = args.p_sections ?? null;
      return { data: "v1", error: null };
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

const baseCtx = {
  taskId: "t1", engagementId: "e1", taskTitle: "Draft", taskSubtitle: "",
  roleCode: "pmo-analyst", agentFile: "# Agent", produces: "02-scope/x",
  unresolvedProduces: null, destination: "docs", output: null, renders: null,
  // One pinned input, so the citation step has a real source to resolve against.
  inputs: [{ path: "01-intake/sow", version: 1 }],
  doneCriteria: [], inventory: [], phaseRows: [],
  template: null, templateName: null,
  priorDraft: null, rejections: [], sprint: null,
  hasWebSearch: false,
};

const actor = { engagementId: "e1", orgId: "org1", roleCode: "pmo-analyst", holder: "Sam", scope: "mine" };

const draftCall = {
  name: "draft",
  input: {
    summary: "Drafted the scope.",
    sections: [{ heading: "Scope", body: "in", cites: ["01-intake/sow"] }],
  },
};

function replyWith(toolCall: unknown, extra: Record<string, unknown> = {}) {
  dispatch.mockResolvedValue({
    stopReason: "tool_use", refusalExplanation: null, text: "", toolCall, usage: null, ...extra,
  });
}

beforeEach(() => {
  log = [];
  filed = null;
  taskState = "running";
  dispatch.mockReset();
  runCode.mockReset();
  runScaffold.mockReset();
  buildContext.mockReset();
  buildContext.mockResolvedValue({ ...baseCtx });
  process.env.ANTHROPIC_API_KEY = "test";
});

/** Everything after the run opened, up to but not including the model call. */
const OPENING = ["claim", "mirror:running", "emit:agent.run.started"];

describe("draft — the full happy path", () => {
  it("files, cites, publishes, supersedes, then hands over — in that order", async () => {
    replyWith(draftCall);

    const out = await runAgent(actor as never, "t1");

    expect(log).toEqual([
      ...OPENING,
      "turn.insert", // the summary goes into the conversation BEFORE anything is validated or filed
      "rpc:file_document",
      "emit:document.filed",
      "citation.insert", // provenance is recorded after filing, against the version just written
      "publish",
      "question.update", // open questions are superseded only once the document exists
      "emit:question.superseded",
      "release:hitl", // released and set to hitl in one write…
      "mirror:hitl", // …then the board…
      "emit:agent.run.finished(drafted)", // …then the record of the run.
    ]);
    expect(filed).toEqual([{ heading: "Scope", body: "in" }]);
    expect(out).toMatchObject({
      kind: "drafted", sections: 1, path: "02-scope/x", publishedUrl: "https://docs/x",
    });
  });

  it("a tickets destination files the document but does not publish a page", async () => {
    buildContext.mockResolvedValue({ ...baseCtx, destination: "tickets" });
    replyWith(draftCall);

    const out = await runAgent(actor as never, "t1");

    expect(log).not.toContain("publish");
    expect(log).toContain("rpc:file_document");
    expect(log.slice(-3)).toEqual(["release:hitl", "mirror:hitl", "emit:agent.run.finished(drafted)"]);
    expect(out).toMatchObject({ kind: "drafted", publishedUrl: null });
  });

  it("a row with no `produces` halts before filing, releasing as a failure", async () => {
    buildContext.mockResolvedValue({ ...baseCtx, produces: null });
    replyWith(draftCall);

    const out = await runAgent(actor as never, "t1");

    expect(log).toEqual([...OPENING, "turn.insert", "release:failed"]);
    expect(log).not.toContain("rpc:file_document");
    expect(out.kind).toBe("error");
  });

  it("a subject the run does not have halts before filing", async () => {
    buildContext.mockResolvedValue({ ...baseCtx, unresolvedProduces: "05-design/{epic}" });
    replyWith(draftCall);

    const out = await runAgent(actor as never, "t1");

    expect(log).not.toContain("rpc:file_document");
    expect(log.at(-1)).toBe("release:failed");
    expect(out.kind).toBe("error");
  });
});

describe("sprint — same pipeline, structure rendered into sections", () => {
  it("files the overview, the agent's sections, then the commitments — numbered by ctx", async () => {
    buildContext.mockResolvedValue({ ...baseCtx, sprint: { number: 7 } });
    replyWith({
      name: "sprint",
      input: {
        goal: "g", starts: "s", ends: "e",
        sections: [{ heading: "Notes", body: "n", cites: [] }],
        commitments: [{ story: "KAN-1" }],
      },
    });

    const out = await runAgent(actor as never, "t1");

    // The number is the app's, not the model's — page and board must describe the same sprint.
    expect(filed?.map((s) => s.heading)).toEqual(["Sprint 7 overview", "Notes", "Commitments"]);
    expect(out).toMatchObject({ kind: "drafted", sections: 3 });
    expect(log.at(-1)).toBe("emit:agent.run.finished(drafted)");
  });
});

describe("ask", () => {
  const askCall = {
    name: "ask",
    input: {
      preamble: "Two things.",
      questions: [{ prompt: "What is the budget?", type: "text", why: "sizing" }],
    },
  };

  it("records the turn, inserts the questions, then parks the row at awaiting", async () => {
    replyWith(askCall);

    const out = await runAgent(actor as never, "t1");

    expect(log).toEqual([
      ...OPENING,
      "turn.insert", // the human reads this turn; the questions hang off its id
      "question.insert",
      "emit:question.asked",
      "release:awaiting",
      "mirror:awaiting",
      "emit:agent.run.finished(asked)",
    ]);
    expect(out).toMatchObject({ kind: "asked" });
  });

  it("an ask that asks nothing, on an authoring row, is a failed run and inserts nothing", async () => {
    replyWith({ name: "ask", input: { preamble: "Fine.", questions: [] } });

    const out = await runAgent(actor as never, "t1");

    expect(log).toEqual([
      ...OPENING, "turn.insert", "release:failed", "emit:agent.run.finished(ask-empty)",
    ]);
    expect(out.kind).toBe("error");
  });
});

describe("code — the build hand-off", () => {
  const codeCall = { name: "code", input: { summary: "Add X", approach: "Do Y", files: ["a.ts"] } };

  it("records intent BEFORE the build, the result after, then hands over", async () => {
    runCode.mockResolvedValue({ ok: true, prUrl: "https://gh/pr/1", branch: "b", exit: 0, log: "ok" });
    replyWith(codeCall);

    const out = await runAgent(actor as never, "t1");

    expect(runCode).toHaveBeenCalledTimes(1);
    expect(log).toEqual([
      ...OPENING,
      "turn.insert", // intent — written first so a build that dies still leaves a trace
      "turn.insert", // outcome
      "release:hitl",
      "mirror:hitl",
      "emit:agent.run.finished(built)",
    ]);
    expect(out).toMatchObject({ kind: "drafted", path: "https://gh/pr/1" });
  });

  it("a build that ships nothing still hands over to a person, and reports an error", async () => {
    runCode.mockResolvedValue({ ok: false, prUrl: null, branch: "b", exit: 2, log: "boom" });
    replyWith(codeCall);

    const out = await runAgent(actor as never, "t1");

    expect(log.slice(-3)).toEqual(["release:hitl", "mirror:hitl", "emit:agent.run.finished(build-failed)"]);
    expect(out.kind).toBe("error");
  });

  it("a refused build records why, releases, and closes the log — same order as every other exit", async () => {
    runCode.mockResolvedValue({ refusal: "No repo configured." });
    replyWith(codeCall);

    const out = await runAgent(actor as never, "t1");

    expect(log).toEqual([
      ...OPENING, "turn.insert", "turn.insert", "release:failed", "emit:agent.run.finished(build-refused)",
    ]);
    expect(out).toEqual({ kind: "error", message: "No repo configured." });
  });
});

describe("scaffold — a shipped run closes itself, judgment moved to its reviewer", () => {
  const scaffoldCall = { name: "scaffold", input: { summary: "art-swap-backend", framework: "nextjs-ts", options: "" } };
  const backendRecord = {
    path: "scaffold-record", version: 1,
    body: "## Repositories\n\n| key | name | framework |\n|---|---|---|\n"
      + "| backend | art-swap-backend | nextjs-ts |\n",
  };

  beforeEach(() => {
    buildContext.mockResolvedValue({
      ...baseCtx, output: "scaffold", subject: { ref: "backend", key: null }, inputs: [backendRecord],
    });
  });

  it("on shipped: records intent then outcome, measures, approves with no confirmations, and releases clean — no hand-over", async () => {
    runScaffold.mockResolvedValue({
      version: 1, status: "shipped", branch: "feat/scaffold-backend",
      pr_url: "https://github.com/o/r/pull/1", files_changed: 12,
      checks: { ran: ["npm ci", "npm run build"], failed: null, tail: null },
      refusal: null, log_ref: "l", usage: null,
    });
    replyWith(scaffoldCall);

    const out = await runAgent(actor as never, "t1");

    expect(runScaffold).toHaveBeenCalledTimes(1);
    // No "mirror:hitl": a shipped scaffold has only machine criteria left (ci green, PR linked —
    // see migration 20261007073000), so it closes itself the way a supplied row does. It never
    // reaches the hand-over a judged row would.
    expect(log).toEqual([
      ...OPENING,
      "turn.insert", // intent — written before the generator runs
      "turn.insert", // outcome
      "release:ok",
      "emit:agent.run.finished(scaffolded)",
    ]);
    expect(out).toMatchObject({ kind: "drafted", path: "https://github.com/o/r/pull/1" });
  });

  it("refuses a scaffold call for a repo the accepted record never named, without spawning the generator", async () => {
    buildContext.mockResolvedValue({
      ...baseCtx,
      output: "scaffold",
      subject: { ref: "app", key: null },
      inputs: [{
        path: "scaffold-record", version: 1,
        body: "## Repositories\n\n| key | name | framework |\n|---|---|---|\n"
          + "| backend | art-swap-backend | nextjs-ts |\n",
      }],
    });
    replyWith(scaffoldCall);

    const out = await runAgent(actor as never, "t1");

    expect(runScaffold).not.toHaveBeenCalled();
    expect(log.slice(-2)).toEqual(["turn.insert", "release:failed"]);
    expect(out.kind).toBe("error");
    expect((out as { message: string }).message).toMatch(/not listed in the accepted/);
  });

    it("on checks_failed: hands over to a person, same as a failed build", async () => {
    runScaffold.mockResolvedValue({
      version: 1, status: "checks_failed", branch: "feat/scaffold-backend", pr_url: null,
      files_changed: 0, checks: { ran: ["npm ci", "npm run build"], failed: "npm run build", tail: "x" },
      refusal: null, log_ref: "l", usage: null,
    });
    replyWith(scaffoldCall);

    const out = await runAgent(actor as never, "t1");

    expect(log.slice(-3)).toEqual(["release:hitl", "mirror:hitl", "emit:agent.run.finished(scaffold-failed)"]);
    expect(out.kind).toBe("error");
  });
});


describe("other exits", () => {
  it("QUIRK: a model refusal records the turn and releases, with no `finished` event", async () => {
    dispatch.mockResolvedValue({
      stopReason: "refusal", refusalExplanation: "no", text: "", toolCall: null, usage: null,
    });

    const out = await runAgent(actor as never, "t1");

    expect(log).toEqual([...OPENING, "turn.insert", "release:failed"]);
    expect(out).toEqual({ kind: "refused", reason: "no" });
  });

  it("prose with no tool call on an authoring row is a failed run", async () => {
    dispatch.mockResolvedValue({
      stopReason: "end_turn", refusalExplanation: null, text: "hello", toolCall: null, usage: null,
    });

    const out = await runAgent(actor as never, "t1");

    expect(log).toEqual([
      ...OPENING, "turn.insert", "release:failed", "emit:agent.run.finished(no-tool)",
    ]);
    expect(out.kind).toBe("error");
  });

  it("a review row that only talks hands over to its reviewer", async () => {
    buildContext.mockResolvedValue({ ...baseCtx, renders: "doc-review", produces: null });
    dispatch.mockResolvedValue({
      stopReason: "end_turn", refusalExplanation: null, text: "answer", toolCall: null, usage: null,
    });

    const out = await runAgent(actor as never, "t1");

    expect(log).toEqual([
      ...OPENING, "turn.insert", "release:hitl", "mirror:hitl", "emit:agent.run.finished(reviewed)",
    ]);
    expect(out).toMatchObject({ kind: "drafted", path: null });
  });

  it("an unknown tool releases as a failure and says so", async () => {
    replyWith({ name: "nonsense", input: {} });

    const out = await runAgent(actor as never, "t1");

    expect(log).toEqual([...OPENING, "release:failed"]);
    expect(out).toEqual({ kind: "error", message: "Unknown tool: nonsense" });
  });

  it("a host that throws releases as a failure and records the error", async () => {
    dispatch.mockRejectedValue(new Error("network down"));

    const out = await runAgent(actor as never, "t1");

    expect(log).toEqual([...OPENING, "release:failed", "emit:agent.run.finished(error)"]);
    expect(out).toEqual({ kind: "error", message: "network down" });
  });
});
