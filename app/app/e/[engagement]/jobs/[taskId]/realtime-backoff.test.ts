import { describe, it, expect } from "vitest";
import { backoffMs } from "./realtime-backoff";

describe("backoffMs", () => {
  it("doubles each retry, starting at 1s", () => {
    expect(backoffMs(0)).toBe(1000);
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(3)).toBe(8000);
  });

  it("caps at 30s instead of growing without bound on a real outage", () => {
    expect(backoffMs(5)).toBe(30_000);
    expect(backoffMs(20)).toBe(30_000);
  });
});
