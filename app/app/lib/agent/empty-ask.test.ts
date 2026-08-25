import { describe, it, expect, vi } from "vitest";

// `run.ts` constructs an Anthropic client and reaches Supabase at module scope. The diagnosis is a
// pure string check, so the side-effecting neighbours are stubbed away.
vi.mock("server-only", () => ({}));
vi.mock("../supabase", () => ({ supabaseAdmin: () => null }));
// The ask-policy constants are stubbed with their real values: mocked away they arrive as
// `undefined`, and `slice(0, undefined)` is an empty array — a cap that silently drops every
// question rather than failing.
vi.mock("./context", () => ({
  buildContext: async () => null, systemPrompt: () => "", inputPrompt: () => "",
  revisionPrompt: () => null, pinInputs: async () => 0,
  ASK_BATCH: 3, ASK_ROUNDS_MAX: 4,
}));
vi.mock("../data/events", () => ({ emit: async () => {}, orgIdFor: async () => null }));
vi.mock("../data/tracker", () => ({ mirrorState: async () => ({ ok: true }) }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { stream: () => {} }; } }));

const { emptyAskDiagnosis } = await import("./run");

// The shape that actually occurred: the model closed the parameter inside its own string value,
// so twelve questions ended up as text in the preamble and `questions` arrived empty.
const LEAKED =
  `I've been asked to produce the foundation architecture and both inputs are empty.\n\n` +
  `I don't need exhaustive answers. I need enough to derive rather than guess.</preamble>  ` +
  `<parameter name="questions">[{"prompt": "In two or three sentences: what is the product?", ` +
  `"type": "text", "why": "Everything downstream derives from this."}, ` +
  `{"prompt": "List the epics, one per line.", "type": "text", "why": "The criterion needs them."}, ` +
  `{"prompt": "What data does the system hold?", "type": "text", "why": "Sets the data posture."}]`;

describe("emptyAskDiagnosis", () => {
  it("recognises questions leaked into the preamble, and counts them", () => {
    const d = emptyAskDiagnosis(LEAKED);
    expect(d.leaked).toBe(true);
    expect(d.buried).toBe(3);
  });

  // Either marker on its own is enough — the model does not always emit both.
  it("catches either tool-syntax marker", () => {
    expect(emptyAskDiagnosis("text</preamble>").leaked).toBe(true);
    expect(emptyAskDiagnosis(`text<parameter name="questions">`).leaked).toBe(true);
  });

  // A model that genuinely asked nothing is a DIFFERENT failure, and reporting it as a leak would
  // send someone hunting for questions that were never written.
  it("does not claim a leak when the preamble is ordinary prose", () => {
    const d = emptyAskDiagnosis("I have everything I need and nothing to ask about.");
    expect(d.leaked).toBe(false);
    expect(d.buried).toBe(0);
  });

  it("is safe on an empty preamble", () => {
    expect(emptyAskDiagnosis("")).toEqual({ leaked: false, buried: 0 });
  });

  // It counts, it does not parse. Recovering the questions by parsing pseudo-XML would risk filing
  // a question the agent never asked; re-running is cheap and truthful.
  it("counts by the JSON key rather than parsing the fragment", () => {
    const truncated = `blah</preamble><parameter name="questions">[{"prompt": "only one, and cut off`;
    const d = emptyAskDiagnosis(truncated);
    expect(d.leaked).toBe(true);
    expect(d.buried).toBe(1);
  });
});
