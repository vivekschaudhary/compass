import { describe, it, expect, vi } from "vitest";

// Every row belongs inside the row that opened it.
//
// The defect: a row that nests a workflow does no work itself — it opens a run, and that run's
// steps are the work. The queue rendered those steps as loose top-level cards, so the nesting row's
// card was the one thing on screen that could not be acted on while looking exactly like one that
// could. `CT-153 Staffing plan and resources` sat at "started · no agent attached yet" with its
// actual work one card below it, wearing the same name, because `resources.1` repeats its parent's
// title — as do three of the seed's other nesting rows.
//
// Two guards matter as much as the grouping. A row whose parent is not on screen must stay visible
// rather than fall through the gap, and a row two levels down must land in the outermost card:
// `sprint-0`'s `Epics` row nests `epics`, whose row 7 nests `tech-design` once per epic, and
// attaching each row to its immediate parent would put those rows inside a card that is itself only
// ever rendered as a child — which is to say, nowhere.

vi.mock("server-only", () => ({}));
vi.mock("../supabase", () => ({ supabaseAdmin: () => null }));
vi.mock("../agent/context", () => ({ pinInputs: async () => {} }));
vi.mock("./events", () => ({ emitRefusal: async () => {} }));

const { groupByParent } = await import("./tasks");
type Card = Parameters<typeof groupByParent>[0][number];

/** Only what the grouping reads. The card's other forty fields are irrelevant here. */
const card = (id: string, parentTaskId: string | null = null, over: Partial<Card> = {}): Card =>
  ({ id, title: id, parentTaskId, runId: parentTaskId ? `run-of-${id}` : "run-top", ...over }) as Card;

/** The shape under test, flattened to something a failure message can be read off. */
const shape = (cards: Card[]) =>
  groupByParent(cards).map((g) => [g.card.id, g.children.map((c) => c.id)] as const);

describe("groupByParent", () => {
  it("leaves a queue with no nesting exactly as it found it", () => {
    expect(shape([card("a"), card("b")])).toEqual([
      ["a", []],
      ["b", []],
    ]);
  });

  // The regression. CT-164 is a row of the run CT-153 opened; it belongs inside CT-153's card, not
  // beside it.
  it("puts a child row inside the row that opened its run", () => {
    expect(shape([card("CT-153"), card("CT-164", "CT-153")])).toEqual([
      ["CT-153", ["CT-164"]],
    ]);
  });

  it("keeps the order it was given, which is already queueOrder's", () => {
    const cards = [card("nest"), card("step-1", "nest"), card("step-2", "nest"), card("later")];
    expect(shape(cards)).toEqual([
      ["nest", ["step-1", "step-2"]],
      ["later", []],
    ]);
  });

  // A parent that is closed, or owned by a role outside this actor's scope, is not in the list at
  // all. Its rows must not disappear with it.
  it("leaves a row top-level when its parent is not on screen", () => {
    expect(shape([card("orphan", "closed-parent")])).toEqual([["orphan", []]]);
  });

  // Two deep: epics.7 nests tech-design. The tech-design rows go in the OUTERMOST card, because the
  // epics.7 row is itself only rendered as a child of it.
  it("lifts a grandchild into the outermost visible card", () => {
    const cards = [
      card("Epics"),
      card("epics.7", "Epics"),
      card("design-KAN-1", "epics.7"),
      card("design-KAN-2", "epics.7"),
    ];
    expect(shape(cards)).toEqual([
      ["Epics", ["epics.7", "design-KAN-1", "design-KAN-2"]],
    ]);
  });

  // The same, with the middle row gone — it closed, so the queue dropped it. The rows under it are
  // still open and still have to be reachable.
  it("keeps a grandchild visible when the row between is gone", () => {
    expect(shape([card("Epics"), card("design-KAN-1", "epics.7")])).toEqual([
      ["Epics", []],
      ["design-KAN-1", []],
    ]);
  });

  // A fan-out opens one run per epic against ONE parent row. Every row of every run lands in the
  // same card; which run each came from is what `runId` and the subject are for.
  it("gathers the rows of several sibling runs into one card", () => {
    const cards = [
      card("Epics"),
      card("a-1", "Epics", { runId: "run-a" }),
      card("b-1", "Epics", { runId: "run-b" }),
    ];
    expect(shape(cards)).toEqual([["Epics", ["a-1", "b-1"]]]);
  });

  // Not reachable through `open_nested_run` — which is exactly why nothing would notice if it
  // became reachable some other way. A page render must not hang, and neither row may be swallowed
  // into a group nested inside itself: both go back to the top level, where they can be seen.
  it("terminates on a cycle rather than hanging, keeping both rows visible", () => {
    expect(shape([card("x", "y"), card("y", "x")])).toEqual([
      ["x", []],
      ["y", []],
    ]);
  });

  it("does not treat a row as its own parent", () => {
    expect(shape([card("self", "self")])).toEqual([["self", []]]);
  });
});
