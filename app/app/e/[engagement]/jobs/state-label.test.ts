import { describe, it, expect } from "vitest";
import { labelFor } from "./state-label";

// A claimed row and an ALIVE one are different facts — the queue must say so the same way the job
// page's own banner does (heartbeat-config.ts), not just "agent working…" over a dead claim.

describe("labelFor", () => {
  it("says a live claim is working, with no elapsed text", () => {
    expect(labelFor("running", "app", new Date().toISOString())).toBe("agent working…");
  });

  it("says an unclaimed running row has no agent attached yet", () => {
    expect(labelFor("running", null, null)).toBe("started · no agent attached yet");
  });

  it("names a stale claim as stuck, not working", () => {
    const oldHeartbeat = new Date(Date.now() - 20 * 60_000).toISOString();
    expect(labelFor("running", "app", oldHeartbeat)).toMatch(/^stuck — no response for/);
  });

  it("other states are unaffected by heartbeat", () => {
    expect(labelFor("hitl")).toBe("awaiting approval");
    expect(labelFor("closed")).toBe("done");
  });
});
