import { describe, it, expect } from "vitest";
import { isStale, lastSign, formatElapsed } from "./heartbeat-config";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

describe("isStale", () => {
  it("is false for a fresh heartbeat and true past the threshold", () => {
    expect(isStale(ago(1))).toBe(false);
    expect(isStale(ago(20))).toBe(true);
  });

  it("is false with no evidence at all — 'unknown' is not 'dead'", () => {
    expect(isStale(null)).toBe(false);
  });
});

describe("lastSign", () => {
  it("prefers the heartbeat", () => {
    expect(lastSign("hb", "started")).toBe("hb");
  });

  // The review finding: a claim with no heartbeat used to read as alive for ever, because
  // isStale(null) is false. Falling back to started_at gives it the same grace period as any other
  // claim, and then lets it be seen as stuck.
  it("falls back to when the row started, so a heartbeat-less claim can still go stale", () => {
    expect(isStale(lastSign(null, ago(20)))).toBe(true);
    expect(isStale(lastSign(null, ago(1)))).toBe(false);
  });

  it("is null only when there is nothing to judge from", () => {
    expect(lastSign(null, null)).toBeNull();
  });
});

describe("formatElapsed", () => {
  it("formats seconds and minutes", () => {
    const now = Date.now();
    expect(formatElapsed(new Date(now - 43_000).toISOString(), now)).toBe("43s");
    expect(formatElapsed(new Date(now - 72_000).toISOString(), now)).toBe("1m 12s");
  });
});
