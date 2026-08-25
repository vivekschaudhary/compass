import { describe, it, expect, vi } from "vitest";

// `tasks.ts` is server-only and reaches Supabase at module scope. `queueNotices` is pure, so the
// side-effecting neighbours are stubbed away and the decision is tested on its own — the same
// arrangement `queue-order.test.ts` uses, for the same reason.
vi.mock("server-only", () => ({}));
vi.mock("../supabase", () => ({ supabaseAdmin: () => null }));
vi.mock("../agent/context", () => ({ pinInputs: async () => {} }));
vi.mock("./events", () => ({ emitRefusal: async () => {} }));

const { queueNotices } = await import("./tasks");

type Args = Parameters<typeof queueNotices>[0];

/** A fresh engagement's numbers, overridden per case so each test states only what it is about. */
const at = (x: Partial<Args>): Args => ({
  mineQueued: 0,
  totalQueued: 0,
  startedMine: 0,
  startedVisible: 0,
  ...x,
});

describe("queueNotices", () => {
  it("says nothing has run on a fresh engagement with work waiting", () => {
    // Twelve sprint-0 rows created, none touched. The sentence is true and worth saying: it
    // explains that clicking is what starts an agent.
    expect(queueNotices(at({ mineQueued: 12, totalQueued: 12 }))).toEqual({
      banner: "never-run",
      empty: null,
    });
  });

  // THE REGRESSION. The SOW was drafted, reviewed and accepted, so it closed and left the queue —
  // taking the only evidence that anything ever ran with it. Deriving the claim from the queue
  // made it true again, and the screen told a delivery manager nothing had run an hour after the
  // engagement's first deliverable was published.
  it("does not say nothing has run when the only started task has since closed", () => {
    expect(
      queueNotices(at({ mineQueued: 11, totalQueued: 11, startedMine: 1, startedVisible: 1 })),
    ).toEqual({ banner: null, empty: null });
  });

  // This case already worked, and pins WHY it worked: a task at hitl is still in the queue with
  // its started_at set. Without it a future change could "fix" the closed case by looking at
  // in-flight state and quietly reintroduce the same bug at a different moment.
  it("stays quiet while a task is mid-flight and still queued", () => {
    expect(
      queueNotices(at({ mineQueued: 12, totalQueued: 12, startedMine: 1, startedVisible: 1 })),
    ).toEqual({ banner: null, empty: null });
  });

  it("distinguishes a finished engagement from one that has not begun", () => {
    // Both have an empty queue. Only the started count separates them.
    expect(queueNotices(at({ startedMine: 12, startedVisible: 12 }))).toEqual({
      banner: null,
      empty: "all-done",
    });
    expect(queueNotices(at({}))).toEqual({ banner: null, empty: "none-yet" });
  });

  // A role that has done nothing on an engagement where others have. The banner is about THIS
  // role's work, so someone else's activity must not silence it.
  it("keeps the banner for a role that has started nothing, whatever the engagement has done", () => {
    expect(
      queueNotices(at({ mineQueued: 4, totalQueued: 16, startedMine: 0, startedVisible: 9 })),
    ).toEqual({ banner: "never-run", empty: null });
  });

  // The banner explains what clicking a card does, so with no card to click it explains nothing.
  it("does not announce that nothing has run when there is nothing to run", () => {
    expect(queueNotices(at({ totalQueued: 3 }))).toEqual({ banner: null, empty: null });
  });
});
