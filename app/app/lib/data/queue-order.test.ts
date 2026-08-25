import { describe, it, expect, vi } from "vitest";

// `tasks.ts` is server-only and reaches Supabase at module scope. `queueOrder` is pure, so the
// side-effecting neighbours are stubbed away and the comparator is tested on its own.
vi.mock("server-only", () => ({}));
vi.mock("../supabase", () => ({ supabaseAdmin: () => null }));
vi.mock("../agent/context", () => ({ pinInputs: async () => {} }));
vi.mock("./events", () => ({ emitRefusal: async () => {} }));

const { queueOrder } = await import("./tasks");

/** Only the fields the comparator reads; the rest of a Row is irrelevant here. */
type R = Parameters<typeof queueOrder>[0];
const row = (title: string, opened: string | null, ord: number | null): R =>
  ({
    title,
    workflow_run: opened === null ? null : { opened_at: opened, workflow: { code: "sprint-0" } },
    workflow_step: ord === null ? null : { reads: null, kind: "agent", ord },
  }) as unknown as R;

const order = (rows: R[]) => [...rows].sort(queueOrder).map((r) => (r as unknown as { title: string }).title);

const RUN_1 = "2026-08-20T20:24:50.000Z";
const RUN_2 = "2026-08-21T09:00:00.000Z";

describe("queueOrder", () => {
  // The defect this exists for: a phase inserts all its rows in one transaction, so created_at is
  // identical across them and whatever order the database returns is the order the screen showed.
  it("orders a phase's rows by their step, whatever order they arrive in", () => {
    const rows = [
      row("Kickoff", RUN_1, 13),
      row("File the SOW", RUN_1, 1),
      row("Epics from milestones", RUN_1, 6),
      row("Product brief", RUN_1, 2),
    ];
    expect(order(rows)).toEqual([
      "File the SOW", "Product brief", "Epics from milestones", "Kickoff",
    ]);
  });

  // `ord` is only meaningful WITHIN a version. Sorting on it alone puts setup's row 1 next to
  // sprint-0's row 1, interleaving two phases that ran at different times.
  it("groups by run before ordering within it", () => {
    const rows = [
      row("sprint-0 step 1", RUN_2, 1),
      row("setup step 1", RUN_1, 1),
      row("sprint-0 step 2", RUN_2, 2),
    ];
    expect(order(rows)).toEqual(["setup step 1", "sprint-0 step 1", "sprint-0 step 2"]);
  });

  // An earlier run first, because phases run in sequence and that is their real order.
  it("puts the run that opened first at the top", () => {
    expect(order([row("later", RUN_2, 1), row("earlier", RUN_1, 9)]))
      .toEqual(["earlier", "later"]);
  });

  // Ad-hoc work has no step and no run. There is no position among numbered rows it could honestly
  // claim, and sorting it first would push the whole phase down.
  it("puts work with no run or step last", () => {
    const rows = [
      row("adhoc", null, null),
      row("step 2", RUN_1, 2),
      row("step 1", RUN_1, 1),
    ];
    expect(order(rows)).toEqual(["step 1", "step 2", "adhoc"]);
  });

  it("keeps a step-less row inside a run at the end of that run", () => {
    const rows = [
      row("no step", RUN_1, null),
      row("step 1", RUN_1, 1),
      row("next run", RUN_2, 1),
    ];
    expect(order(rows)).toEqual(["step 1", "no step", "next run"]);
  });

  // PostgREST returns an embedded to-one as an object or a one-element array depending on the query
  // shape; handling only one of them would silently fall back to unordered.
  it("tolerates to-one relations arriving as arrays", () => {
    const asArray = (title: string, opened: string, ord: number) =>
      ({
        title,
        workflow_run: [{ opened_at: opened, workflow: { code: "sprint-0" } }],
        workflow_step: [{ reads: null, kind: "agent", ord }],
      }) as unknown as R;
    expect(order([asArray("b", RUN_1, 2), asArray("a", RUN_1, 1)])).toEqual(["a", "b"]);
  });
});
