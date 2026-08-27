import { describe, it, expect } from "vitest";
import { planRepoint, type RepointStep } from "./repoint";

const step = (id: string, ord: number, task: string): RepointStep => ({ id, ord, task });

/* The real case: sprint-0 v4 → v5. Same twelve rows, criteria corrected, nothing else moved. */
describe("moving a run to the published version", () => {
  const v4 = [step("a4", 1, "file-sow"), step("b4", 2, "draft-product-brief"), step("c4", 3, "draft-timeline")];
  const v5 = [step("a5", 1, "file-sow"), step("b5", 2, "draft-product-brief"), step("c5", 3, "draft-timeline")];

  it("maps every step onto its counterpart", () => {
    const p = planRepoint(v4, v5);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.moves.get("a4")).toBe("a5");
    expect(p.moves.get("b4")).toBe("b5");
    expect(p.moves.get("c4")).toBe("c5");
    expect(p.renumbered).toEqual([]);
  });

  // The whole reason slugs are the key. A row that moved position is still the same row.
  it("follows a row that was renumbered, and says so", () => {
    const reordered = [step("a5", 1, "file-sow"), step("c5", 2, "draft-timeline"), step("b5", 3, "draft-product-brief")];
    const p = planRepoint(v4, reordered);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.moves.get("b4")).toBe("b5");            // the brief, now at ord 3
    expect(p.moves.get("c4")).toBe("c5");            // the timeline, now at ord 2
    expect(p.renumbered).toEqual([
      { task: "draft-product-brief", from: 2, to: 3 },
      { task: "draft-timeline", from: 3, to: 2 },
    ]);
  });
});

/* The refusal. This is the only thing standing between the script and silent corruption. */
describe("refuses a move it cannot complete", () => {
  const v4 = [step("a4", 1, "file-sow"), step("b4", 2, "draft-product-brief"), step("c4", 3, "draft-timeline")];

  it("refuses when a step has no counterpart, and names it", () => {
    const dropped = [step("a5", 1, "file-sow"), step("c5", 2, "draft-timeline")];
    const p = planRepoint(v4, dropped);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.orphans).toEqual(["draft-product-brief"]);
  });

  it("names every orphan, not just the first — the report is the whole decision", () => {
    const p = planRepoint(v4, [step("a5", 1, "file-sow")]);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.orphans).toEqual(["draft-product-brief", "draft-timeline"]);
  });

  // A renamed slug is a DIFFERENT row as far as this is concerned, and that is the safe reading:
  // the alternative is guessing that `draft-timeline` and `draft-schedule` are the same work.
  it("treats a renamed task as missing rather than guessing", () => {
    const renamed = [step("a5", 1, "file-sow"), step("b5", 2, "draft-product-brief"), step("c5", 3, "draft-schedule")];
    const p = planRepoint(v4, renamed);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.orphans).toEqual(["draft-timeline"]);
  });

  // Refuses WHOLE. A plan that moved two of three rows would leave the run split across two
  // versions — coherent-looking and wrong.
  it("returns no partial mapping when it refuses", () => {
    const p = planRepoint(v4, [step("a5", 1, "file-sow")]);
    expect(p.ok).toBe(false);
    expect(p).not.toHaveProperty("moves");
  });

  // Extra rows in the target are fine: the new version may add steps this run simply never
  // materialised. Only the source having something unmatched is a problem.
  it("allows the target to have steps the run does not", () => {
    const grown = [
      step("a5", 1, "file-sow"), step("b5", 2, "draft-product-brief"),
      step("c5", 3, "draft-timeline"), step("d5", 4, "draft-raci"),
    ];
    const p = planRepoint(v4, grown);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.moves.size).toBe(3);
  });

  it("refuses a run whose version has steps and whose target has none", () => {
    const p = planRepoint(v4, []);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.orphans).toHaveLength(3);
  });
});
