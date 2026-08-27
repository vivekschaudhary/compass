import { describe, it, expect, vi, beforeEach } from "vitest";

// The subject is `composeTicketBody`: what reaches the model, and what is done with what comes
// back. Everything around it is a boundary — Supabase, Jira, the host — and each is stubbed so the
// decisions are testable without a database, a board or a model.
vi.mock("server-only", () => ({}));
vi.mock("../supabase", () => ({ supabaseAdmin: () => null }));
vi.mock("../jira", () => ({ resolveJira: () => null, updateIssue: async () => true }));
vi.mock("./events", () => ({ emit: async () => {}, orgIdFor: async () => "org" }));

// The two context readers this module leans on. `agentMarkdown` is the one that decides whether
// anything is composed at all, so it is a mock the tests drive.
const agentMarkdown = vi.fn<(e: string, o: string, r: string) => Promise<string | null>>();
vi.mock("../agent/context", () => ({
  agentMarkdown: (e: string, o: string, r: string) => agentMarkdown(e, o, r),
  doneCriteriaFor: async () => [],
  loadDocumentText: async () => ({ path: "", title: null, version: null, body: null }),
}));

// The host seam. `dispatch` returns whatever a test sets, and `selectHost` can throw the way an
// unavailable host really does.
const dispatch = vi.fn();
let selectThrows: Error | null = null;
vi.mock("../agent/hosts/select", () => ({
  MODEL: "test-model",
  selectHost: () => {
    if (selectThrows) throw selectThrows;
    return { name: "test", dispatch };
  },
}));

const { composeTicketBody, ACCEPTANCE_HEADING, composeIncomplete } = await import("./ticket-body");

const AGENT_MD = "# Delivery manager\n\n## What my tickets carry\n\nName the product.";

/** A host answer that used the tool. */
const answered = (tickets: unknown) => ({
  stopReason: "tool_use", refusalExplanation: null, text: "",
  toolCall: { name: "ticket_bodies", input: { tickets } }, usage: null,
});

const ticket = (over: Partial<Parameters<typeof composeTicketBody>[0]["tickets"][number]> = {}) => ({
  ref: "task:1", issueType: "Story" as const, roleCode: "product-manager", key: "CT-16",
  summary: "Product brief", facts: { produces: "01-product/brief" }, doneCriteria: [], ...over,
});

const call = (over: Partial<Parameters<typeof composeTicketBody>[0]> = {}) =>
  composeTicketBody({
    engagementId: "eng", orgId: "org", roleCode: "product-manager",
    programme: { engagement: "Calcium", context: ["Phase: Sprint 0."] },
    grounding: [], tickets: [ticket()], ...over,
  });

beforeEach(() => {
  vi.clearAllMocks();
  selectThrows = null;
  agentMarkdown.mockResolvedValue(AGENT_MD);
  dispatch.mockResolvedValue(answered([{ ref: "task:1", summary: "A real title", description: "A real body." }]));
});

describe("what governs the writing", () => {
  // The whole point of the change. The role's markdown is the standard for what a ticket carries,
  // and it must arrive as the system prompt — not be summarised into an instruction here, which is
  // how the file quietly stops being the standard.
  it("sends the role's agent markdown as the system prompt", async () => {
    await call();
    expect(dispatch.mock.calls[0][0].system).toBe(AGENT_MD);
  });

  it("asks for the markdown of the role that owns the ticket", async () => {
    await call({ roleCode: "delivery-manager" });
    expect(agentMarkdown).toHaveBeenCalledWith("eng", "org", "delivery-manager");
  });

  // A role with no agent file has no standard. Composing anyway would put the model's own idea of a
  // ticket on a client's board under that role's name — `role.code = 'pm'` is exactly this case,
  // because `agents/pm.md` does not exist.
  it("composes nothing when the role has no agent file", async () => {
    agentMarkdown.mockResolvedValue(null);
    const out = await call();
    expect(out.reason).toBe("no-agent-file");
    expect(out.bodies).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
    expect(out.problems[0]).toMatch(/product-manager/);
  });
});

describe("what the model is told", () => {
  it("names the engagement, the ticket and what the record holds", async () => {
    await call();
    const prompt = dispatch.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("Calcium");
    expect(prompt).toContain("Phase: Sprint 0.");
    expect(prompt).toContain("task:1");
    expect(prompt).toContain("Product brief");
    expect(prompt).toContain("01-product/brief");
  });

  // `[thin-is-said-out-loud]`. With no documents the honest instruction is to say what is missing,
  // and the prompt must not leave the model to infer that from silence.
  it("says plainly when there is nothing to draw on", async () => {
    const prompt = (await call(), dispatch.mock.calls[0][0].messages[0].content as string);
    expect(prompt).toContain("NOTHING");
  });

  it("passes the documents in full when there are any", async () => {
    await call({
      grounding: [{ path: "02-scope/sow", title: "The SOW", version: "v2", body: "## Scope\nSix months." }],
    });
    const prompt = dispatch.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("02-scope/sow");
    expect(prompt).toContain("Six months.");
    expect(prompt).not.toContain("NOTHING");
  });

  // A declared document that was never drafted is an absence the model should state, not a blank
  // it should fill.
  it("marks a declared but undrafted document as undrafted", async () => {
    await call({ grounding: [{ path: "01-product/brief", title: "Brief", version: null, body: null }] });
    expect(dispatch.mock.calls[0][0].messages[0].content as string).toContain("never been drafted");
  });

  it("shapes the instruction by issue type", async () => {
    await call({ tickets: [ticket({ issueType: "Bug" })] });
    expect(dispatch.mock.calls[0][0].messages[0].content as string).toContain("behaving wrongly");
  });
});

describe("the acceptance criteria", () => {
  const criteria = ["The brief is approved by the client sponsor.", "Every section cites its source."];

  // Point 4 of the contract: the criteria go in VERBATIM. Enforced in code rather than asked of the
  // model, because a paraphrased acceptance list on a client's board is a different agreement.
  it("appends the recorded criteria verbatim, whatever the model wrote", async () => {
    dispatch.mockResolvedValue(answered([{ ref: "task:1", summary: "t", description: "A body with no acceptance." }]));
    const out = await call({ tickets: [ticket({ doneCriteria: criteria })] });
    expect(out.bodies[0].description).toContain(ACCEPTANCE_HEADING);
    for (const c of criteria) expect(out.bodies[0].description).toContain(`- ${c}`);
  });

  it("tells the model not to write its own", async () => {
    await call({ tickets: [ticket({ doneCriteria: criteria })] });
    const prompt = dispatch.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain("Do not restate, paraphrase or add to them");
  });

  // No criteria is a fact about the row, not a gap to paper over with an empty section.
  it("adds no acceptance section when none are recorded", async () => {
    const out = await call();
    expect(out.bodies[0].description).not.toContain(ACCEPTANCE_HEADING);
    expect(dispatch.mock.calls[0][0].messages[0].content as string).toContain("no acceptance criteria are recorded");
  });
});

describe("what comes back", () => {
  it("maps bodies by ref, not by position", async () => {
    dispatch.mockResolvedValue(answered([
      { ref: "task:2", summary: "second", description: "the second body" },
      { ref: "task:1", summary: "first", description: "the first body" },
    ]));
    const out = await call({ tickets: [ticket(), ticket({ ref: "task:2", key: "CT-17" })] });
    expect(out.bodies.find((b) => b.ref === "task:1")?.description).toBe("the first body");
    expect(out.bodies.find((b) => b.ref === "task:2")?.key).toBe("CT-17");
  });

  // A ref nobody asked for is not one of these tickets. Writing it would put invented text on a
  // real board, so it is dropped AND named — a silent drop is the false-green shape.
  it("drops an unknown ref and says so", async () => {
    dispatch.mockResolvedValue(answered([
      { ref: "task:1", summary: "ok", description: "kept" },
      { ref: "task:99", summary: "invented", description: "dropped" },
    ]));
    const out = await call();
    expect(out.bodies).toHaveLength(1);
    expect(out.problems.join(" ")).toMatch(/task:99/);
  });

  it("drops a duplicate rather than writing twice", async () => {
    dispatch.mockResolvedValue(answered([
      { ref: "task:1", summary: "first", description: "first" },
      { ref: "task:1", summary: "again", description: "again" },
    ]));
    const out = await call();
    expect(out.bodies).toHaveLength(1);
    expect(out.bodies[0].description).toBe("first");
    expect(out.problems.join(" ")).toMatch(/duplicate/);
  });

  // A ticket the model skipped keeps its placeholder, and that has to be visible: a count of what
  // was written cannot say which ones were not.
  it("names a ticket the model returned nothing for", async () => {
    dispatch.mockResolvedValue(answered([{ ref: "task:1", summary: "ok", description: "body" }]));
    const out = await call({ tickets: [ticket(), ticket({ ref: "task:2", key: "CT-17", summary: "Roster" })] });
    expect(out.bodies).toHaveLength(1);
    expect(out.problems.join(" ")).toMatch(/task:2.*Roster|Roster/);
  });

  it("keeps the existing title when the model returns an empty one", async () => {
    dispatch.mockResolvedValue(answered([{ ref: "task:1", summary: "   ", description: "body" }]));
    expect((await call()).bodies[0].summary).toBe("Product brief");
  });

  it("refuses an empty body rather than writing one", async () => {
    dispatch.mockResolvedValue(answered([{ ref: "task:1", summary: "t", description: "  " }]));
    const out = await call();
    expect(out.bodies).toEqual([]);
    expect(out.problems.join(" ")).toMatch(/Empty body/);
  });
});

describe("failures are loud and told apart", () => {
  it("reports an unavailable host as a host problem", async () => {
    selectThrows = new Error("the `claude` binary is not on PATH");
    const out = await call();
    expect(out.reason).toBe("no-host");
    expect(out.problems[0]).toMatch(/not on PATH/);
    expect(out.bodies).toEqual([]);
  });

  it("reports a refusal as a refusal, with the explanation", async () => {
    dispatch.mockResolvedValue({
      stopReason: "refusal", refusalExplanation: "I will not write that.", text: "",
      toolCall: null, usage: null,
    });
    const out = await call();
    expect(out.reason).toBe("model-refused");
    expect(out.problems[0]).toMatch(/I will not write that/);
  });

  // Prose instead of a tool call is a real outcome — the answer cannot become field values, and
  // silently treating it as "nothing to do" would leave placeholders with no explanation.
  it("reports an answer that skipped the tool", async () => {
    dispatch.mockResolvedValue({
      stopReason: "end_turn", refusalExplanation: null, text: "Here are some thoughts instead.",
      toolCall: null, usage: null,
    });
    const out = await call();
    expect(out.reason).toBe("model-silent");
    expect(out.problems[0]).toMatch(/Here are some thoughts/);
  });

  it("treats a malformed tool payload as nothing composed, not as a crash", async () => {
    dispatch.mockResolvedValue(answered("not an array"));
    const out = await call();
    expect(out.bodies).toEqual([]);
    expect(out.problems.join(" ")).toMatch(/task:1/);
  });

  it("does not call a host when there is nothing to compose", async () => {
    const out = await call({ tickets: [] });
    expect(out.reason).toBe("nothing-to-compose");
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("composeIncomplete", () => {
  // The same distinction `mirrorIncomplete` makes: nothing owed is not a shortfall, and reporting
  // it as one would put a permanent warning on every engagement running without a tracker.
  it("is false when nothing was owed", () => {
    for (const reason of ["no-tracker", "no-supabase", "nothing-to-compose"] as const) {
      expect(composeIncomplete({ written: [], expected: 0, problems: [], reason })).toBe(false);
    }
  });

  it("is true when fewer bodies were written than owed", () => {
    expect(composeIncomplete({ written: [], expected: 3, problems: ["nope"], reason: "patch-refused" })).toBe(true);
  });

  it("is false when every ticket got its body", () => {
    const written = [{ ref: "task:1", key: "CT-16", summary: "s", description: "d" }];
    expect(composeIncomplete({ written, expected: 1, problems: [] })).toBe(false);
  });
});
