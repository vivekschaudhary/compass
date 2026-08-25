import { describe, it, expect, vi } from "vitest";

// `run.ts` constructs an Anthropic client and reaches Supabase at module scope. Both helpers under
// test are pure, so the side-effecting neighbours are stubbed away.
//
// `./context` is deliberately NOT mocked: it carries ASK_BATCH, and the whole point of the cap is
// that the number the prompt tells the agent is the number the code enforces. A test that supplied
// its own cap would pass with the two out of step.
vi.mock("server-only", () => ({}));
vi.mock("../supabase", () => ({ supabaseAdmin: () => null }));
vi.mock("../specs", () => ({ resolveSpec: async () => null }));
vi.mock("../data/events", () => ({ emit: async () => {}, orgIdFor: async () => null }));
vi.mock("../data/tracker", () => ({ mirrorState: async () => ({ ok: true }) }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { stream: () => {} }; } }));

const { splitAsk, askRoundNudge } = await import("./run");
const { ASK_BATCH, ASK_ROUNDS_MAX } = await import("./context");

const q = (n: number) => Array.from({ length: n }, (_, i) => ({ prompt: `q${i}` }));

describe("splitAsk", () => {
  it("puts a short ask through whole", () => {
    const { put, held } = splitAsk(q(2));
    expect(put).toHaveLength(2);
    expect(held).toHaveLength(0);
  });

  // The thirteen-question ask this exists for.
  it("holds everything past the cap", () => {
    const { put, held } = splitAsk(q(13));
    expect(put).toHaveLength(ASK_BATCH);
    expect(held).toHaveLength(13 - ASK_BATCH);
  });

  // The whole contract. The agent was told to order by how much each answer changes the rest of the
  // work, and nothing here re-ranks — so the first three ARE the three that matter most. Reordering
  // would put the least consequential question in front of the human and look identical in a count.
  it("keeps the model's order, and loses nothing between the halves", () => {
    const { put, held } = splitAsk(q(13));
    expect([...put, ...held].map((x) => x.prompt)).toEqual(q(13).map((x) => x.prompt));
  });

  it("splits nothing when there is nothing", () => {
    expect(splitAsk([])).toEqual({ put: [], held: [] });
  });
});

describe("askRoundNudge", () => {
  it("says nothing while there is budget left", () => {
    expect(askRoundNudge(0)).toBeNull();
    expect(askRoundNudge(ASK_ROUNDS_MAX - 2)).toBeNull();
  });

  it("announces the last round rather than springing it", () => {
    const nudge = askRoundNudge(ASK_ROUNDS_MAX - 1);
    expect(nudge).toContain("last one");
  });

  // Past the budget the instruction is to draft — and to say what is unresolved inside the
  // deliverable, because a gap the reviewer cannot see is the failure this system exists to stop.
  it("stops the interview once the budget is spent", () => {
    for (const rounds of [ASK_ROUNDS_MAX, ASK_ROUNDS_MAX + 3]) {
      const nudge = askRoundNudge(rounds);
      expect(nudge).toContain("Do not ask again");
      expect(nudge).toContain("unresolved");
    }
  });
});
