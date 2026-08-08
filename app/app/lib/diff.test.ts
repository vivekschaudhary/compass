import { describe, it, expect } from "vitest";
import { diffLines, diffStat, collapseUnchanged } from "./diff";

const text = (lines: string[]) => lines.join("\n");

describe("diffLines", () => {
  it("reports nothing for identical input", () => {
    const d = diffLines("a\nb\nc", "a\nb\nc")!;
    expect(d.every((l) => l.type === "same")).toBe(true);
    expect(diffStat(d)).toEqual({ added: 0, removed: 0, changed: false });
  });

  it("finds an inserted line without rewriting everything around it", () => {
    // A naive line-by-line comparison would mark every line after the insert as changed. The whole
    // reason for LCS is that a one-line insert reads as one line.
    const d = diffLines(text(["a", "b", "c"]), text(["a", "NEW", "b", "c"]))!;
    expect(diffStat(d)).toEqual({ added: 1, removed: 0, changed: true });
    expect(d.find((l) => l.type === "add")!.text).toBe("NEW");
  });

  it("finds a removed line", () => {
    const d = diffLines(text(["a", "b", "c"]), text(["a", "c"]))!;
    expect(diffStat(d)).toEqual({ added: 0, removed: 1, changed: true });
    expect(d.find((l) => l.type === "remove")!.text).toBe("b");
  });

  it("reads a modified line as one removal and one addition", () => {
    const d = diffLines(text(["a", "b", "c"]), text(["a", "B!", "c"]))!;
    expect(diffStat(d)).toEqual({ added: 1, removed: 1, changed: true });
  });

  it("handles the ends: everything added, everything removed", () => {
    expect(diffStat(diffLines("", text(["a", "b"]))!).added).toBe(2);
    expect(diffStat(diffLines(text(["a", "b"]), "")!).removed).toBe(2);
  });

  it("numbers lines on both sides so the UI can show gutters", () => {
    const d = diffLines(text(["a", "b"]), text(["a", "x", "b"]))!;
    const same = d.filter((l) => l.type === "same");
    expect(same[0].aLine).toBe(1);
    expect(same[0].bLine).toBe(1);
    expect(same[1].aLine).toBe(2);
    expect(same[1].bLine).toBe(3);       // shifted by the insert
  });

  it("preserves blank lines rather than swallowing them", () => {
    // Markdown depends on them; a diff that hides a deleted blank line hides a real change.
    const d = diffLines("a\n\nb", "a\nb")!;
    expect(diffStat(d).removed).toBe(1);
  });

  it("refuses a pathological input instead of hanging", () => {
    // O(n·m) memory: a huge paste should degrade to "too large" rather than allocating forever.
    const huge = new Array(6000).fill("x").join("\n");
    expect(diffLines(huge, huge, 5000)).toBeNull();
    expect(diffStat(null)).toEqual({ added: 0, removed: 0, changed: true });
  });

  it("handles a realistic markdown edit", () => {
    const before = text(["## Dispatch graph", "", "### Step 1. `pm.draft`", "", "**Dispatches:** pm"]);
    const after = text(["## Dispatch graph", "", "### Step 1. `pm.draft`", "", "**Dispatches:** pm",
                        "", "### Step 2. HITL gate", "", "**Dispatches:** HUMAN"]);
    expect(diffStat(diffLines(before, after)!)).toMatchObject({ added: 4, removed: 0 });
  });
});

describe("collapseUnchanged", () => {
  const long = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`);

  it("keeps context either side of a change and collapses the rest", () => {
    // A three-line edit in a 400-line workflow must not render 400 lines, or the change is
    // invisible and the diff is pointless.
    const before = text(long(100));
    const after = text(long(100).map((l, i) => (i === 50 ? "CHANGED" : l)));
    const rows = collapseUnchanged(diffLines(before, after)!, 3);
    expect(rows.length).toBeLessThan(20);
    expect(rows.some((r) => r.type === "gap")).toBe(true);
  });

  it("collapses nothing when everything changed", () => {
    const rows = collapseUnchanged(diffLines("a\nb", "x\ny")!, 3);
    expect(rows.some((r) => r.type === "gap")).toBe(false);
  });

  it("collapses an identical file into a single gap", () => {
    const rows = collapseUnchanged(diffLines(text(long(50)), text(long(50)))!, 3);
    expect(rows).toEqual([{ type: "gap", count: 50 }]);
  });
});
