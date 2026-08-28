import { describe, it, expect, vi } from "vitest";

// `filesTo` is the guard on a path that came out of a MODEL and is about to be written to. The rest
// of `run.ts` reaches Supabase and the SDK; only the guard is under test, so those are stubbed at
// the module boundary.
vi.mock("server-only", () => ({}));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
vi.mock("../supabase", () => ({ supabaseAdmin: () => null, must: () => null }));
vi.mock("../data/publish", () => ({ publishToDocs: async () => ({ ok: true }) }));
vi.mock("../data/tracker", () => ({ mirrorState: async () => ({ ok: true }) }));
vi.mock("../data/events", () => ({ emit: async () => {} }));
vi.mock("../data/job", () => ({ conversation: async () => [], openQuestions: async () => [] }));
vi.mock("../data/phases", () => ({ nestedWorkflowOf: async () => null }));
vi.mock("../data/backlog", () => ({
  normaliseBacklog: () => ({ epics: [], problems: [] }),
  sectionsOf: () => [],
  recordBacklog: async () => ({ written: 0, problems: [] }),
}));
vi.mock("./hosts/select", () => ({ selectHost: () => ({ dispatch: async () => ({}) }), MODEL: "m" }));

const { filesTo } = await import("./run");

describe("filesTo", () => {
  // The point of the whole mechanism: a BRD the human pastes lands verbatim at a real path.
  it("accepts a deliverable path", () => {
    expect(filesTo("02-scope/business-requirements")).toBe("02-scope/business-requirements");
    expect(filesTo("01-foundation/product-brief")).toBe("01-foundation/product-brief");
    expect(filesTo("00-overview/notes")).toBe("00-overview/notes");
  });

  it("normalises case and padding", () => {
    expect(filesTo("  02-Scope/Business-Requirements  ")).toBe("02-scope/business-requirements");
  });

  it("is null when the agent asked an ordinary question", () => {
    expect(filesTo(undefined)).toBeNull();
    expect(filesTo(null)).toBeNull();
    expect(filesTo("")).toBeNull();
  });

  // A path is model output. Left unchecked, an agent naming a framework file would turn a pasted
  // answer into a spec override — so this fails closed on anything that is not a document path.
  it("refuses anything outside the document tree", () => {
    for (const bad of [
      "agents/pm.md",                 // a framework spec, not a deliverable
      "../../etc/passwd",
      "/02-scope/sow",                // absolute
      "02-scope",                     // a folder, not a document
      "02-scope/a/b",                 // nested deeper than the tree goes
      "06-other/thing",               // not a prefix the tree has
      "02-scope/sow.md",              // paths carry no extension
      "02-scope/Business Requirements",
    ]) {
      expect(filesTo(bad), bad).toBeNull();
    }
  });

  // 04 and 05 are produced BY workflow steps. Letting an answer land at one would let a pasted
  // message overwrite a deliverable an agent is accountable for.
  it("refuses the paths that workflow steps own", () => {
    expect(filesTo("04-governance/decisions")).toBeNull();
    expect(filesTo("05-cadence/kickoff")).toBeNull();
  });
});
