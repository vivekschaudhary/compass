import { describe, it, expect, vi, beforeEach } from "vitest";

// Filing an epic opens the work that belongs to it. What matters: it opens for each epic that was
// just created and for no other, a workflow that is not triggered is left alone, and one run that
// will not open costs a line in the report — never the epic and never the other runs.

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ orgIdFor: async () => "org1" }));

const initiatePhase = vi.fn();
vi.mock("./phases", () => ({ initiatePhase: (...a: unknown[]) => initiatePhase(...a) }));

let triggered: { code: string }[] = [];
const filters: [string, unknown][] = [];
vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: () => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
        then: (res: (v: { data: unknown }) => unknown) => res({ data: triggered }),
      };
      return q;
    },
  }),
}));

const { openRunsForEpics, epicTriggeredWorkflows } = await import("./epic-runs");

const actor = { engagementId: "e1", orgId: "org1", roleCode: "product-manager", holder: "Nishi" } as never;

beforeEach(() => {
  initiatePhase.mockReset().mockImplementation(async (_a, _w, _t, epic: string) => ({ ok: true, runId: `run-${epic}`, tasks: [] }));
  triggered = [{ code: "refine-stories" }];
  filters.length = 0;
});

describe("epicTriggeredWorkflows", () => {
  it("asks only for enabled workflows that declare the epic-filed trigger", async () => {
    await epicTriggeredWorkflows("e1");
    expect(filters).toContainEqual(["trigger", "epic-filed"]);
    expect(filters).toContainEqual(["enabled", true]);
  });
});

describe("openRunsForEpics", () => {
  it("opens the workflow for each epic, passing the epic as the subject", async () => {
    const out = await openRunsForEpics(actor, [{ ref: "ACC-E1" }, { ref: "LST-E1" }]);

    expect(out.opened.map((o) => o.epic).sort()).toEqual(["ACC-E1", "LST-E1"]);
    expect(initiatePhase).toHaveBeenCalledWith(actor, "refine-stories", undefined, "ACC-E1");
    expect(initiatePhase).toHaveBeenCalledWith(actor, "refine-stories", undefined, "LST-E1");
    expect(out.problems).toEqual([]);
  });

  it("opens nothing when no workflow is triggered by an epic", async () => {
    triggered = [];
    const out = await openRunsForEpics(actor, [{ ref: "ACC-E1" }]);
    expect(initiatePhase).not.toHaveBeenCalled();
    expect(out.opened).toEqual([]);
  });

  it("opens nothing when no epic was filed", async () => {
    const out = await openRunsForEpics(actor, []);
    expect(initiatePhase).not.toHaveBeenCalled();
    expect(out.opened).toEqual([]);
  });

  it("reports an epic whose run would not open, and still opens the rest", async () => {
    initiatePhase.mockImplementation(async (_a, _w, _t, epic: string) =>
      epic === "LST-E1" ? { ok: false, error: "Refine stories is not ready:\n  The doc store answers. — not satisfied" }
                        : { ok: true, runId: `run-${epic}`, tasks: [] });

    const out = await openRunsForEpics(actor, [{ ref: "ACC-E1" }, { ref: "LST-E1" }, { ref: "SWP-E1" }]);

    expect(out.opened.map((o) => o.epic).sort()).toEqual(["ACC-E1", "SWP-E1"]);
    expect(out.problems).toHaveLength(1);
    expect(out.problems[0]).toMatch(/LST-E1.*refine-stories did not open — Refine stories is not ready:/);
  });

  it("treats a thrown error as a report, not a failure of the whole batch", async () => {
    initiatePhase.mockImplementation(async (_a, _w, _t, epic: string) => {
      if (epic === "ACC-E1") throw new Error("connection reset");
      return { ok: true, runId: `run-${epic}`, tasks: [] };
    });
    const out = await openRunsForEpics(actor, [{ ref: "ACC-E1" }, { ref: "LST-E1" }]);
    expect(out.opened.map((o) => o.epic)).toEqual(["LST-E1"]);
    expect(out.problems.join(" ")).toMatch(/ACC-E1.*connection reset/);
  });

  it("never runs more than a few at once", async () => {
    let inFlight = 0, peak = 0;
    initiatePhase.mockImplementation(async (_a, _w, _t, epic: string) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { ok: true, runId: `run-${epic}`, tasks: [] };
    });
    const epics = Array.from({ length: 19 }, (_, i) => ({ ref: `E${i}` }));
    const out = await openRunsForEpics(actor, epics);
    expect(out.opened).toHaveLength(19);
    expect(peak).toBeLessThanOrEqual(4);
  });
});
