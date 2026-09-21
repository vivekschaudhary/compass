import { describe, it, expect, vi, beforeEach } from "vitest";

// Opening a nested run measures the row that opened it.
//
// The defect: `startTaskAction` measured, started, and THEN opened the child run. So
// `evaluateNested` was asked "has every resources run this row opened closed?" at the one moment
// the answer was "no such run" — unmeasurable, which by design writes nothing and clears any stale
// row. The card then said "not checked" about a criterion that became knowable one line later, and
// nothing re-measured it until a person found the re-check button.
//
// That is not cosmetic here. "Not checked" reading the same as "nothing to see" is exactly how the
// nesting-close defect stayed invisible for an hour on the live engagement, and the gate treats an
// unmeasured criterion as blocking — correctly — so the row carries a verdict nobody took.
//
// What is asserted is the ORDER. Both calls existed before; only one of them could see a run.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** Every call the action makes, in sequence. The fix is a position in this list. */
let calls: string[] = [];
let nests: string | null = "resources";
let startOk = true;

vi.mock("@/app/lib/data/actor", () => ({
  resolveActor: async () => ({ engagementId: "eng", orgId: "org", roleCode: "delivery-manager", holder: "Joe" }),
}));
vi.mock("@/app/lib/data/tasks", () => ({
  startTask: async () => {
    calls.push("start");
    return startOk ? { ok: true } : { ok: false, error: "Waiting on: Timeline & Milestones" };
  },
}));
vi.mock("@/app/lib/data/gates", () => ({
  measureTask: async () => { calls.push("measure"); return []; },
}));
vi.mock("@/app/lib/data/phases", () => ({
  nestedWorkflowOf: async () => nests,
  openNestedFanOut: async () => {
    calls.push("open-run");
    return { ok: true, runs: [{ subject: null, mirrored: { epic: null, stories: [], expected: 0, problems: [] } }] };
  },
  initiatePhase: async () => ({ ok: true }),
  remirrorPhase: async () => ({ ok: true }),
}));
vi.mock("@/app/lib/data/tracker", () => ({ mirrorIncomplete: () => false }));
vi.mock("@/app/lib/data/ticket-body", () => ({ composeIncomplete: () => false }));

const { startTaskAction } = await import("./actions");

beforeEach(() => { calls = []; nests = "resources"; startOk = true; });

describe("starting a row that nests a workflow", () => {
  it("measures again AFTER the run exists", async () => {
    const r = await startTaskAction("eng", "delivery-manager", "t1");
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["measure", "start", "open-run", "measure"]);
  });

  // The first measure is the gate's, and it has to stay in front of the start: a Ready criterion is
  // checked on evidence taken seconds ago, not on whenever someone last looked.
  it("still measures before starting, so the refusal is current", async () => {
    startOk = false;
    const r = await startTaskAction("eng", "delivery-manager", "t1");
    expect(r.ok).toBe(false);
    expect(calls).toEqual(["measure", "start"]);
  });

  // An ordinary row opens nothing, so there is nothing new for a second measure to see.
  it("does not measure twice on a row that nests nothing", async () => {
    nests = null;
    const r = await startTaskAction("eng", "delivery-manager", "t1");
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["measure", "start"]);
  });
});
