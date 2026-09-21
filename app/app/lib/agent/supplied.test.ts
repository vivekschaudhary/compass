import { describe, it, expect, vi, beforeEach } from "vitest";

// A row whose deliverable is SUPPLIED by a person, not written by the agent.
//
// The assertions are mostly about what does NOT happen — no `draft` tool, no document filed, no
// model call — because that is where the behaviour lives. A test that only checked returned
// messages would pass while the agent authored the client's contract anyway.

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

const approveCalls: { taskId: string; confirmed: string[] }[] = [];
const approveResult = { value: { ok: true } as { ok: boolean; error?: string } };
vi.mock("../data/gates", () => ({
  measureTask: async () => [],
  approve: async (_a: unknown, taskId: string, confirmed: string[]) => {
    approveCalls.push({ taskId, confirmed });
    return approveResult.value;
  },
}));

const open = vi.fn(async () => [] as unknown[]);
vi.mock("../data/job", () => ({
  conversation: async () => [],
  openQuestions: (...a: unknown[]) => open(...(a as [])),
}));

const rpcCalls: string[] = [];
const inserted: Record<string, unknown>[] = [];
/** Every patch written to `work_task`, so a test can assert the row was handed over. */
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
          if (table === "question") inserted.push(...list);
          if (table === "turn") turns.push(String(list[0]?.body ?? ""));
          return q;
        },
        maybeSingle: async () => ({ data: { org_id: "org1" } }),
        single: async () => ({ data: { id: "turn1" }, error: null }),
        then: (res: (v: { data: unknown; error: null }) => void) => res({ data: [], error: null }),
      };
      return q;
    },
    rpc: async (name: string) => { rpcCalls.push(name); return { data: "v1", error: null }; },
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
const { toolsFor } = await import("./hosts/tools");

const actor = { engagementId: "e1", orgId: "org1", roleCode: "pmo-analyst", holder: "Sam", scope: "mine" };

const ctx = (over: Record<string, unknown> = {}) => ({
  taskId: "t1", engagementId: "e1", taskTitle: "File the SOW", taskSubtitle: "",
  roleCode: "pmo-analyst", agentFile: "# Agent", produces: "sow",
  unresolvedProduces: null, destination: "docs", output: "supplied", inputs: [],
  doneCriteria: [], inventory: [], phaseRows: [],
  template: null, templateName: null, priorDraft: null, rejections: [], sprint: null,
  ...over,
});

const asked = (questions: Record<string, unknown>[]) => ({
  stopReason: "tool_use", refusalExplanation: null, text: "",
  toolCall: { name: "ask", input: { preamble: "I need the document.", questions } },
  usage: null,
});

/** The row is waiting on a person: `hitl`, and nobody still holding it. */
const handedOver = () =>
  taskPatches.some((p) => p.state === "hitl" && p.executor === null);

beforeEach(() => {
  rpcCalls.length = 0; inserted.length = 0; taskPatches.length = 0; turns.length = 0;
  approveCalls.length = 0; approveResult.value = { ok: true };
  dispatch.mockReset(); buildContext.mockReset();
  open.mockReset(); open.mockResolvedValue([]);
  process.env.ANTHROPIC_API_KEY = "test";
});

describe("toolsFor — the whole mechanism", () => {
  it("gives a supplied row `ask` and NOTHING else", () => {
    // The one fact the design rests on: with no `draft` tool the agent cannot author the client's
    // document, whatever it decides. Telling it not to is advice, and advice is what failed.
    const names = toolsFor("supplied").map((t) => t.name);
    expect(names).toEqual(["ask"]);
    expect(names).not.toContain("draft");
  });

  it("leaves an ordinary authoring row with ask AND draft", () => {
    // The change must not narrow rows it does not name.
    const names = toolsFor(null).map((t) => t.name).sort();
    expect(names).toEqual(["ask", "draft"]);
  });

  it("does not disturb the other specialised kinds", () => {
    expect(toolsFor("backlog").map((t) => t.name).sort()).toEqual(["ask", "backlog"]);
    expect(toolsFor("code").map((t) => t.name).sort()).toEqual(["ask", "code"]);
  });
});

describe("where a supplied answer is filed", () => {
  it("coerces files_to to what the row produces, ignoring the model's path", () => {
    // One destination exists. Letting a model name it is a decision with one right answer.
    buildContext.mockResolvedValue(ctx());
    dispatch.mockResolvedValue(asked([
      { prompt: "Paste the SOW", type: "text", why: "", files_to: "02-scope/something-else" },
    ]));
    return runAgent(actor as never, "t1").then(() => {
      expect(inserted).toHaveLength(1);
      expect(inserted[0].files_to).toBe("sow");
    });
  });

  it("leaves an ordinary question unfiled", async () => {
    buildContext.mockResolvedValue(ctx());
    dispatch.mockResolvedValue(asked([
      { prompt: "Paste the SOW", type: "text", why: "", files_to: "sow" },
      { prompt: "Who signed it?", type: "text", why: "" },
    ]));
    await runAgent(actor as never, "t1");
    expect(inserted.map((q) => q.files_to)).toEqual(["sow", null]);
  });
});

describe("an ask that can never produce the deliverable", () => {
  it("is REFUSED when nothing carries the document and none is filed yet", async () => {
    // Observed live: three questions, every files_to null. With no `draft` tool the row could
    // never complete, and nothing on screen would say why.
    buildContext.mockResolvedValue(ctx());
    dispatch.mockResolvedValue(asked([
      { prompt: "Which Jira project?", type: "text", why: "" },
      { prompt: "Which Confluence space?", type: "text", why: "" },
    ]));

    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("error");
    expect((out as { message: string }).message).toContain("sow");
    expect(inserted).toHaveLength(0);
  });

  it("allows follow-up questions once the document IS filed", async () => {
    buildContext.mockResolvedValue(ctx({
      priorDraft: { version: "1.0", sections: [{ heading: "As supplied", body: "x" }] },
      inputs: [{ path: "sow", title: "SOW", version: "1.0", body: "the sow" }],
    }));
    dispatch.mockResolvedValue(asked([{ prompt: "Who signed it?", type: "text", why: "" }]));

    const out = await runAgent(actor as never, "t1");
    expect(out.kind).toBe("asked");
    expect(inserted).toHaveLength(1);
  });
});

describe("an empty ask as an ending", () => {
  // The third exit, and the one the SOW fix missed. A supplied row holds `ask` and nothing else,
  // so "nothing further is needed" has no other shape to arrive in. Live, `file-requirements`
  // reported its comparison exactly as instructed, twice, and both runs were recorded as
  // `ask-empty` failures that left the row at `running` with its ticket In Progress.
  const emptyAsk = (preamble: string) => ({
    stopReason: "tool_use", refusalExplanation: null, text: "",
    toolCall: { name: "ask", input: { preamble, questions: [] } },
    usage: null,
  });

  const compared = ctx({
    produces: "requirements",
    priorDraft: { version: "1.0", sections: [{ heading: "As supplied", body: "x" }] },
    inputs: [{ path: "sow", title: "SOW", version: "1.0", body: "the sow" }],
  });

  it("CLOSES a supplied row whose document is filed", async () => {
    buildContext.mockResolvedValue(compared);
    dispatch.mockResolvedValue(emptyAsk("Nothing further is needed for this task."));

    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("drafted");
    expect(approveCalls).toHaveLength(1);
    expect(approveCalls[0].confirmed).toEqual([]);
    expect(handedOver()).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it("keeps the report in the conversation", async () => {
    buildContext.mockResolvedValue(compared);
    dispatch.mockResolvedValue(emptyAsk("The requirements match the SOW on dates."));

    await runAgent(actor as never, "t1");

    expect(turns.join(" ")).toContain("match the SOW on dates");
  });

  it("STILL halts loudly when the questions were swallowed into the preamble", async () => {
    // The failure this branch was built for, and it can happen on a supplied row too. A close here
    // would bury real questions — the exact silent pass the loud halt exists to prevent.
    buildContext.mockResolvedValue(compared);
    dispatch.mockResolvedValue(
      emptyAsk('I need a few things.</preamble> <parameter name="questions">[{"prompt": "Who signed it?"}]'),
    );

    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("error");
    expect((out as { message: string }).message).toContain("inside its preamble");
    expect(approveCalls).toHaveLength(0);
  });

  it("STILL halts when nothing has been supplied yet", async () => {
    // No `priorDraft` means no document. Closing would settle a row whose deliverable does not
    // exist, and its Done gate would be the only thing left saying so.
    buildContext.mockResolvedValue(ctx());
    dispatch.mockResolvedValue(emptyAsk("I have nothing to ask."));

    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("error");
    expect(approveCalls).toHaveLength(0);
  });

  it("is untouched on an authoring row", async () => {
    // There an empty ask means the model produced nothing durable, which is a real failure.
    buildContext.mockResolvedValue(ctx({
      output: null,
      priorDraft: { version: "1.0", sections: [{ heading: "Scope", body: "x" }] },
    }));
    dispatch.mockResolvedValue(emptyAsk("Nothing to ask."));

    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("error");
    expect(approveCalls).toHaveLength(0);
  });

  it("hands over to a person if the gate refuses the close", async () => {
    approveResult.value = { ok: false, error: "Not done: someone must confirm it." };
    buildContext.mockResolvedValue(compared);
    dispatch.mockResolvedValue(emptyAsk("Nothing further is needed."));

    await runAgent(actor as never, "t1");

    expect(handedOver()).toBe(true);
    expect(turns.join(" ")).toContain("could not close itself");
  });
});

describe("prose as an ending", () => {
  const prose = {
    stopReason: "end_turn", refusalExplanation: null,
    text: "The requirements match the SOW on dates; scope differs on push notifications.",
    toolCall: null, usage: null,
  };

  it("is a clean outcome for a supplied row — that is how the comparison is reported", async () => {
    buildContext.mockResolvedValue(ctx({
      produces: "requirements",
      priorDraft: { version: "1.0", sections: [{ heading: "As supplied", body: "x" }] },
      inputs: [{ path: "sow", title: "SOW", version: "1.0", body: "the sow" }],
    }));
    dispatch.mockResolvedValue(prose);

    const out = await runAgent(actor as never, "t1");
    expect(out.kind).toBe("drafted");
    expect(rpcCalls).not.toContain("file_document");
    // The same defect lived here too: the comparison would be reported and the row left running.
    // It closes for the same reason the skip path does — the report is information, not a draft.
    expect(approveCalls).toHaveLength(1);
    expect(handedOver()).toBe(false);
  });

  it("is STILL an error on an authoring row", async () => {
    // Scoped deliberately: on a row with a `draft` tool, prose means the model ignored it and
    // produced nothing durable.
    buildContext.mockResolvedValue(ctx({ output: null }));
    dispatch.mockResolvedValue(prose);

    expect((await runAgent(actor as never, "t1")).kind).toBe("error");
  });
});

describe("not spending a run on a foregone conclusion", () => {
  it("skips the model entirely once a supplied row with nothing to read is filed", async () => {
    buildContext.mockResolvedValue(ctx({
      priorDraft: { version: "1.0", sections: [{ heading: "As supplied", body: "x" }] },
      inputs: [],
    }));

    const out = await runAgent(actor as never, "t1");

    expect(out.kind).toBe("drafted");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("CLOSES the row when it skips — nobody approves their own paste", async () => {
    // Two bugs met here. The row was left at `running` with `executor: app`, so it read as "agent
    // working…" for ever; and routing it to `hitl` was wrong anyway, because its gate is entirely
    // machine-checked, which leaves ApprovePanel with nothing to sign and a greyed-out button.
    buildContext.mockResolvedValue(ctx({
      priorDraft: { version: "1.0", sections: [{ heading: "As supplied", body: "x" }] },
      inputs: [],
    }));

    await runAgent(actor as never, "t1");

    expect(approveCalls).toHaveLength(1);
    // NO confirmations: nobody attested anything, and a machine-established measurement stays the
    // check's. `close_task` still enforces the real gate.
    expect(approveCalls[0].confirmed).toEqual([]);
    expect(handedOver()).toBe(false);
  });

  it("falls back to a human when the gate refuses the close", async () => {
    // A supplied row carrying a judgment criterion genuinely does need a person. It must never be
    // left mid-flight, which is what the original bug did.
    approveResult.value = { ok: false, error: "Not done: someone must confirm it." };
    buildContext.mockResolvedValue(ctx({
      priorDraft: { version: "1.0", sections: [{ heading: "As supplied", body: "x" }] },
      inputs: [],
    }));

    await runAgent(actor as never, "t1");

    expect(handedOver()).toBe(true);
    expect(turns.join(" ")).toContain("could not close itself");
  });

  it("acknowledges the paste in the conversation rather than ending on the human's message", async () => {
    buildContext.mockResolvedValue(ctx({
      priorDraft: { version: "1.0", sections: [{ heading: "As supplied", body: "x" }] },
      inputs: [],
    }));

    await runAgent(actor as never, "t1");

    expect(turns.join(" ")).toContain("verbatim");
  });

  it("still runs when the row has something to compare against", async () => {
    buildContext.mockResolvedValue(ctx({
      produces: "requirements",
      priorDraft: { version: "1.0", sections: [{ heading: "As supplied", body: "x" }] },
      inputs: [{ path: "sow", title: "SOW", version: "1.0", body: "the sow" }],
    }));
    dispatch.mockResolvedValue({ stopReason: "end_turn", refusalExplanation: null, text: "compared", toolCall: null, usage: null });

    await runAgent(actor as never, "t1");
    expect(dispatch).toHaveBeenCalled();
  });

  it("still runs when a question is outstanding", async () => {
    open.mockResolvedValue([{ id: "q1", prompt: "Who signed it?" }]);
    buildContext.mockResolvedValue(ctx({
      priorDraft: { version: "1.0", sections: [{ heading: "As supplied", body: "x" }] },
      inputs: [],
    }));
    dispatch.mockResolvedValue({ stopReason: "end_turn", refusalExplanation: null, text: "ok", toolCall: null, usage: null });

    await runAgent(actor as never, "t1");
    expect(dispatch).toHaveBeenCalled();
  });
});
