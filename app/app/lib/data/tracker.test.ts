import { describe, expect, it, vi } from "vitest";

// `tracker.ts` is server-only and reaches Supabase/Jira at module scope through its imports. Only
// the pure predicate is under test here, so the side-effecting neighbours are stubbed away — the
// decision `moveFailed` encodes is the load-bearing part, and it is pure.
vi.mock("server-only", () => ({}));
vi.mock("../supabase", () => ({ supabaseAdmin: () => null }));
vi.mock("../jira", () => ({
  resolveJira: () => null, createIssue: async () => null,
  transitionIssue: async () => false, projectStatuses: async () => [],
}));
vi.mock("./events", () => ({ emit: async () => {} }));

const { moveFailed } = await import("./tracker");

describe("moveFailed", () => {
  // The whole point of the discriminator: a close must be blocked when the board was asked and
  // said no, and must NOT be blocked when there was simply nothing to ask.
  it("is false when there was nothing to move", () => {
    for (const reason of ["no-supabase", "no-ticket", "no-tracker"] as const) {
      expect(moveFailed({ ok: false, reason })).toBe(false);
    }
  });

  it("is true when the move was attempted and did not take", () => {
    // The board has no Done status to move to — the ticket stays where it is, so the task must too.
    expect(moveFailed({ ok: false, reason: "no-status", key: "KAN-1" })).toBe(true);
    // Jira rejected the transition outright.
    expect(moveFailed({ ok: false, reason: "refused", key: "KAN-1", status: "Done" })).toBe(true);
  });

  it("is false on success", () => {
    expect(moveFailed({ ok: true, key: "KAN-1", status: "Done" })).toBe(false);
  });

  // A result with no reason at all is not a failure anyone can act on, and treating it as one would
  // block every close the moment a new early-return forgets to tag itself.
  it("is false when no reason was given", () => {
    expect(moveFailed({ ok: false, note: "something unexplained" })).toBe(false);
  });
});
