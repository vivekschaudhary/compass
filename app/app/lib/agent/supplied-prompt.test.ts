import { describe, it, expect, vi } from "vitest";

// What a SUPPLIED row is actually told.
//
// These assert on the ASSEMBLED prompt, not on the pieces. Each piece was defensible alone — a
// revision instruction is right for a redraft, a do-not-author instruction is right for a supplied
// row — and the contradiction existed only once they were joined. Testing them separately is how it
// shipped, so the load-bearing assertions here run over the whole thing.

vi.mock("server-only", () => ({}));
vi.mock("../supabase", () => ({ supabaseAdmin: () => null, must: () => null }));
vi.mock("../data/templates", () => ({ templateFor: async () => null }));
vi.mock("../jira", () => ({ resolveJira: () => null, searchIssues: async () => [] }));
vi.mock("../data/sprint", () => ({ nextSprintNumber: async () => 1, committedJql: () => "" }));
vi.mock("../data/actor", () => ({ holdersOn: async () => [] }));
vi.mock("../specs", () => ({ resolveSpec: async () => null, COMPASS_DIR: "/nowhere" }));

const { inputPrompt, revisionPrompt } = await import("./context");

const FILED = {
  version: "1.0",
  sections: [{ heading: "As supplied", body: "The client's own requirements text." }],
};

const ctx = (over: Record<string, unknown> = {}) =>
  ({
    taskId: "t1", engagementId: "e1", taskTitle: "File the Requirements", taskSubtitle: "",
    roleCode: "pmo-analyst", agentFile: null, produces: "requirements",
    unresolvedProduces: null, destination: "docs", output: "supplied",
    inputs: [{ path: "sow", title: "SOW", version: "1.0", body: "The SOW text." }],
    doneCriteria: [], inventory: [], phaseRows: [],
    template: null, templateName: null, priorDraft: null, rejections: [], sprint: null,
    ...over,
  }) as unknown as Parameters<typeof inputPrompt>[0];

describe("revisionPrompt", () => {
  it("is silent for a supplied row, even with a filed document", () => {
    // `priorDraft` on a supplied row is the CLIENT'S document. "You already produced this" is a
    // false premise, and it is the one the loop rested on.
    expect(revisionPrompt(ctx({ priorDraft: FILED }))).toBeNull();
  });

  it("still fires for an authoring row — the redraft loop must keep working", () => {
    const out = revisionPrompt(ctx({ output: null, priorDraft: FILED }));
    expect(out).toContain("You already produced");
    expect(out).toContain("Revise it");
  });

  it("is silent when there is no prior draft, as before", () => {
    expect(revisionPrompt(ctx({ output: null }))).toBeNull();
  });
});

describe("the assembled prompt, before the document is supplied", () => {
  const out = inputPrompt(ctx());

  it("asks for it, in one question", () => {
    expect(out).toContain("has not been supplied yet");
    expect(out).toContain("ONE question");
  });

  it("says the answer is filed verbatim", () => {
    expect(out).toContain("verbatim");
    expect(out).toContain("requirements");
  });
});

describe("the assembled prompt, once it is filed", () => {
  const out = inputPrompt(ctx({ priorDraft: FILED }));

  it("shows the document AS supplied, with its version", () => {
    expect(out).toContain("<supplied-document");
    expect(out).toContain('version="1.0"');
    expect(out).toContain("The client's own requirements text.");
  });

  it("NEVER says the agent produced it", () => {
    // The whole bug, in one assertion.
    expect(out).not.toContain("You already produced");
    expect(out).not.toContain("Revise it rather than starting over");
  });

  it("asks for the comparison against the pinned input", () => {
    expect(out).toContain("Compare it against");
    expect(out).toContain("The SOW text.");
  });

  it("rules out the exact move the model made", () => {
    // It asked for "the revised requirements text" because nothing said it could not.
    expect(out).toContain("Do NOT ask for it again");
    expect(out).toContain("do NOT ask for a revised version");
  });
});

describe("a supplied row with nothing to compare against", () => {
  const out = inputPrompt(ctx({ inputs: [], priorDraft: FILED }));

  it("says it is finished rather than asking for a comparison", () => {
    expect(out).toContain("nothing to compare it against");
    expect(out).not.toContain("Compare it against the document(s) above");
  });
});

describe("a row with no inputs still gets everything else", () => {
  // `inputPrompt` used to RETURN at this point, so a row declaring no reads received only the
  // "no input documents" sentence — no supplied block, no template, nothing appended after.
  it("says it has no inputs AND carries the supplied instruction", () => {
    const out = inputPrompt(ctx({ inputs: [] }));
    expect(out).toContain("declares no input documents");
    expect(out).toContain("<supplied");
    expect(out).toContain("has not been supplied yet");
  });
});

describe("an ordinary authoring row is untouched", () => {
  it("gets no supplied block at all", () => {
    const out = inputPrompt(ctx({ output: null, priorDraft: FILED }));
    expect(out).not.toContain("<supplied");
    expect(out).toContain("The SOW text.");
  });
});
