import { describe, it, expect, vi, beforeEach } from "vitest";

// Opening a nested run measures the row that opened it.
//
// The defect this file was written for: `startTaskAction` used to measure, start, and THEN open
// the child run. So `evaluateNested` was asked "has every run this row opened closed?" at the one
// moment the answer was "no such run" — unmeasurable, which by design writes nothing and clears
// any stale row. The card then said "not checked" about a criterion that became knowable one line
// later, and nothing re-measured it until a person found the re-check button.
//
// That is not cosmetic here. "Not checked" reading the same as "nothing to see" is exactly how the
// nesting-close defect stayed invisible for an hour on the live engagement, and the gate treats an
// unmeasured criterion as blocking — correctly — so the row carries a verdict nobody took.
//
// Starting and opening the child run are now two functions, not one branch inside a shared action:
// `startTaskAction` only starts, `startWorkflowAction` starts (by calling it) and then opens the
// run. What is asserted here is still the ORDER, now read off `startWorkflowAction`'s own calls.
//
// NOTE: the `measureTask` calls this file originally asserted around "start" and "open-run" are
// commented out in `actions.ts` today — a separate, pre-existing gap, not introduced by splitting
// the action. The call lists below assert what actually runs, not what should.

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

const { startTaskAction, startWorkflowAction } = await import("./actions");

beforeEach(() => { calls = []; nests = "resources"; startOk = true; });

describe("starting a row that nests a workflow", () => {
  it("starts the row, then opens the child run", async () => {
    const r = await startWorkflowAction("eng", "delivery-manager", "t1");
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["start", "open-run"]);
  });

  // The start is a real gate check, not a formality: a refusal there must stop before anything
  // opens a run for a row that was never allowed to begin.
  it("does not open a run when the start itself is refused", async () => {
    startOk = false;
    const r = await startWorkflowAction("eng", "delivery-manager", "t1");
    expect(r.ok).toBe(false);
    expect(calls).toEqual(["start"]);
  });
});

describe("starting a plain row", () => {
  // The common program. It has no idea what `nests` even is — it is not asked, and nothing about
  // a nested run runs from it, on a row that nests one or not.
  it("only starts — no nested lookup, no run opened", async () => {
    const r = await startTaskAction("eng", "delivery-manager", "t1");
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["start"]);
  });
});
