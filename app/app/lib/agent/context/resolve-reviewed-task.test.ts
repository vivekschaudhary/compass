import { describe, it, expect, vi } from "vitest";
import { resolveReviewedTask } from "./resolve-reviewed-task";

// The bug this closes: `accept-scaffold` depends on `review-scaffold`, itself a `doc-review` row
// with no `produces` of its own (it reviews `scaffold-foundation`'s output). A one-hop lookup found
// `review-scaffold`, saw `produces: null`, and gave up — `reviewPath` came back null, `draft` in
// `page.tsx` was falsy, and the whole ApprovePanel silently never rendered on a row that WAS
// genuinely `hitl`, waiting on a human, with no visible way to act on it.

describe("resolveReviewedTask", () => {
  it("resolves in one hop when the depended-on step actually produces something", async () => {
    const lookup = vi.fn(async (t: string) =>
      t === "research-architecture" ? { produces: "architecture-research", dependsOn: [] } : null,
    );
    const out = await resolveReviewedTask("research-architecture", lookup);
    expect(out).toBe("architecture-research");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("walks past an intermediate review-of-a-review step that produces nothing itself", async () => {
    const rows: Record<string, { produces: string | null; dependsOn: string[] | null }> = {
      "review-scaffold": { produces: null, dependsOn: ["scaffold-foundation"] },
      "scaffold-foundation": { produces: "scaffold-record", dependsOn: ["approve-architecture"] },
    };
    const lookup = vi.fn(async (t: string) => rows[t] ?? null);

    const out = await resolveReviewedTask("review-scaffold", lookup);

    expect(out).toBe("scaffold-record");
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("gives up past maxHops rather than looping on a misconfigured or cyclic graph", async () => {
    const lookup = vi.fn(async (t: string) => ({ produces: null, dependsOn: [t] })); // points at itself
    const out = await resolveReviewedTask("stuck", lookup, 3);
    expect(out).toBeNull();
    expect(lookup).toHaveBeenCalledTimes(3);
  });

  it("returns null immediately when there is nothing to look up", async () => {
    const lookup = vi.fn();
    expect(await resolveReviewedTask(null, lookup)).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns null when a step in the chain does not exist", async () => {
    const lookup = vi.fn(async () => null);
    expect(await resolveReviewedTask("ghost", lookup)).toBeNull();
  });
});
