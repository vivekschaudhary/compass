import { describe, it, expect, vi, beforeEach } from "vitest";

// `openNested` is where the fix actually lands: a nested run's own sub-tasks (`mirrorNested`)
// never composed a real body before this, only `initiatePhase`'s epic+stories did. These tests are
// about the ONE thing that changed — composition now runs after mirroring here too, at the
// `subtask` level, through the same `mirrorAndCompose` path the phase side already used.

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({
  orgIdFor: async () => "org1", emit: async () => {}, emitRefusal: async () => {},
}));
vi.mock("./gates", () => ({
  remeasureRun: async () => {}, measureTask: async () => [], storedStatusFor: async () => new Map(), evaluate: () => [],
}));
vi.mock("./tasks", () => ({ startTask: async () => ({ ok: false, error: "not this test" }) }));

const mirrorNested = vi.fn();
const mirrorState = vi.fn(async () => ({ ok: true }) as { ok: true } | { ok: false; reason: string; note: string });
vi.mock("./tracker", () => ({
  mirrorPhase: vi.fn(),
  mirrorNested: (...a: Parameters<typeof mirrorNested>) => mirrorNested(...a),
  mirrorState: (...a: Parameters<typeof mirrorState>) => mirrorState(...a),
}));

const composeTicketBodies = vi.fn(async () => ({ written: [], expected: 0, problems: [] }));
vi.mock("./ticket-body", () => ({
  composeTicketBodies: (...a: Parameters<typeof composeTicketBodies>) => composeTicketBodies(...a),
}));

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    rpc: async (name: string) =>
      name === "open_nested_run" ? { data: "run-1", error: null } : { data: null, error: null },
    from: (table: string) => {
      const q = {
        select: () => q, eq: () => q, is: () => q, order: () => q, limit: () => q,
        maybeSingle: async () =>
          table === "work_task" ? { data: { id: "t1", workflow_step_id: "step-1" } } : { data: null },
        then: (res: (v: { data: unknown; error: null }) => void) => res({ data: [], error: null }),
      };
      return q;
    },
  }),
}));

const { openNested } = await import("./phases");

const actor = { engagementId: "e1", orgId: "org1", roleCode: "staff-engineer", holder: "Alex" };

beforeEach(() => {
  mirrorNested.mockReset();
  mirrorState.mockReset().mockResolvedValue({ ok: true });
  composeTicketBodies.mockReset().mockResolvedValue({ written: [], expected: 0, problems: [] });
});

describe("openNested composes at the subtask level, after mirroring", () => {
  it("calls composeTicketBodies with taskLevel: 'subtask' once mirrorNested finds a parent ticket", async () => {
    mirrorNested.mockResolvedValue({ epic: "CT-220", stories: [], expected: 2, problems: [] });

    const result = await openNested(actor as never, "t1");

    expect(result.ok).toBe(true);
    expect(composeTicketBodies).toHaveBeenCalledWith("e1", "run-1", "staff-engineer", { taskLevel: "subtask" });
    if (result.ok) expect(result.mirrored.composed).toEqual({ written: [], expected: 0, problems: [] });
  });

  it("never composes when mirroring itself found nothing to hang sub-tasks under", async () => {
    mirrorNested.mockResolvedValue({ epic: null, stories: [], expected: 0, problems: ["no-parent-ticket"] });

    const result = await openNested(actor as never, "t1");

    expect(result.ok).toBe(true);
    expect(composeTicketBodies).not.toHaveBeenCalled();
  });

  it("a composition failure does not fail the open — the run exists whether or not its tickets read well", async () => {
    mirrorNested.mockResolvedValue({ epic: "CT-220", stories: [], expected: 2, problems: [] });
    composeTicketBodies.mockRejectedValue(new Error("model host unavailable"));

    const result = await openNested(actor as never, "t1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mirrored.composed?.reason).toBe("no-host");
      expect(result.mirrored.composed?.problems.join(" ")).toContain("model host unavailable");
    }
  });
});
