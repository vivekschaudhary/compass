import { describe, it, expect } from "vitest";
import { driftOf, hashContent } from "./specs";

// Drift is the answer to "has the tier below moved since I forked it?" — and the whole point of
// the three-tier design failing quietly is that, without this, an override keeps running an old
// version forever with no signal.

const OLD = "## Tickets\n| 1 | a |\n";
const NEW = "## Tickets\n| 1 | a |\n| 2 | b |\n";

describe("driftOf", () => {
  it("is false when the baseline is unchanged", () => {
    const d = driftOf({ baseHash: hashContent(OLD), baseContent: OLD }, OLD);
    expect(d.drifted).toBe(false);
  });

  it("is true when the baseline moved, and can compare", () => {
    const d = driftOf({ baseHash: hashContent(OLD), baseContent: OLD }, NEW);
    expect(d.drifted).toBe(true);
    expect(d.comparable).toBe(true);
    expect(d.baseContent).toBe(OLD);
    expect(d.currentBaseline).toBe(NEW);
  });

  it("detects drift but cannot compare when the baseline text was never recorded", () => {
    // Rows written before 021. "We can't show you" and "nothing changed" must not look the same,
    // so this reports drifted WITHOUT claiming a comparison it cannot make.
    const d = driftOf({ baseHash: hashContent(OLD), baseContent: null }, NEW);
    expect(d.drifted).toBe(true);
    expect(d.comparable).toBe(false);
    expect(d.baseContent).toBeNull();
  });

  it("reports nothing when there is no override", () => {
    expect(driftOf(null, NEW).drifted).toBe(false);
  });

  it("reports nothing when the override predates base_hash entirely", () => {
    // Nothing was anchored, so there is no claim to make — better silent than a false alarm on
    // every legacy row.
    expect(driftOf({ baseHash: null, baseContent: null }, NEW).drifted).toBe(false);
  });

  it("is not fooled by a whitespace-only edit to the baseline", () => {
    // hashContent is exact, deliberately: a trailing newline IS a change to a file parsed by
    // regex, and pretending otherwise would hide a real drift.
    expect(driftOf({ baseHash: hashContent(OLD), baseContent: OLD }, OLD + "\n").drifted).toBe(true);
  });

  it("treats an empty baseline as a real value, not a missing one", () => {
    // A framework file deleted upstream resolves to "". That IS drift — the thing you forked from
    // no longer exists — and must not be swallowed as "no baseline to compare".
    const d = driftOf({ baseHash: hashContent(OLD), baseContent: OLD }, "");
    expect(d.drifted).toBe(true);
  });
});
