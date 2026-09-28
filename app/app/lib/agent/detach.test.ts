import { describe, it, expect, vi, afterEach } from "vitest";
import { detach } from "./detach";

// `detach` returns before the work finishes, and never lets a failure in it vanish.

afterEach(() => vi.restoreAllMocks());

describe("detach", () => {
  it("returns without waiting for the work to finish", async () => {
    let finish!: () => void;
    let done = false;
    detach(() => new Promise<void>((r) => { finish = () => { done = true; r(); }; }));

    // Control is back with the caller while the work is still pending.
    expect(done).toBe(false);
    finish();
    await Promise.resolve();
    expect(done).toBe(true);
  });

  it("still runs the work", async () => {
    const work = vi.fn(async () => {});
    detach(work);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("logs a rejection instead of swallowing it", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    detach(async () => { throw new Error("boom"); });
    await new Promise((r) => setTimeout(r, 0));
    expect(err).toHaveBeenCalled();
  });
});
