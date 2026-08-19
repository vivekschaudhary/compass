import { describe, it, expect } from "vitest";
import { sortByStep, ordOf } from "./steps";

describe("sortByStep", () => {
  it("orders by the step's ord, not by arrival", () => {
    // The real failure: a phase creates every task in one transaction, so created_at is identical
    // and the database returned step 2 first. The epic's stories were numbered backwards.
    const rows = [
      { title: "Staff the engagement", workflow_step: { ord: 2 } },
      { title: "Connect systems of record", workflow_step: { ord: 1 } },
    ];
    expect(sortByStep(rows).map((r) => r.title))
      .toEqual(["Connect systems of record", "Staff the engagement"]);
  });

  it("tolerates a to-one relation arriving as an array", () => {
    // PostgREST returns an embedded to-one as an object or a one-element array depending on the
    // query shape; a sort that only handled one of them would silently fall back to unordered.
    const rows = [
      { title: "b", workflow_step: [{ ord: 2 }] },
      { title: "a", workflow_step: [{ ord: 1 }] },
    ];
    expect(sortByStep(rows).map((r) => r.title)).toEqual(["a", "b"]);
  });

  it("puts a task with no step last rather than first", () => {
    // Ad-hoc work has no step. Sorting it to the front would push the phase's own rows down.
    const rows = [
      { title: "adhoc", workflow_step: null },
      { title: "step 1", workflow_step: { ord: 1 } },
    ];
    expect(sortByStep(rows).map((r) => r.title)).toEqual(["step 1", "adhoc"]);
    expect(ordOf({ workflow_step: null })).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("does not mutate what it was given", () => {
    const rows = [{ workflow_step: { ord: 2 } }, { workflow_step: { ord: 1 } }];
    sortByStep(rows);
    expect(ordOf(rows[0])).toBe(2);
  });
});
