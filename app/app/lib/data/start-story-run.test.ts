import { describe, it, expect, vi, beforeEach } from "vitest";

// Starting `build` for a story: the run's subject is the story, `subject_key` is its ticket (what
// the orchestrator is handed as `--story`), and nothing is mirrored to the board — the story is the
// ticket. These pin the three places that were epic-only: what the start flow accepts, what it
// stores, and what it puts on the board.

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ orgIdFor: async () => "org1", emit: async () => {}, emitRefusal: async () => {} }));
vi.mock("./gates", () => ({
  measureTask: async () => [], evaluate: () => ({ state: "satisfied" }), remeasureRun: async () => {},
  storedStatusFor: async () => new Map(),
}));
vi.mock("./tasks", () => ({ startTask: async () => ({ ok: false, error: "not this test" }) }));
const mirrorEpicTasks = vi.fn();
const mirrorPhase = vi.fn();
vi.mock("./tracker", () => ({
  mirrorEpicTasks: (...a: unknown[]) => mirrorEpicTasks(...a),
  mirrorPhase: (...a: unknown[]) => mirrorPhase(...a),
  mirrorNested: vi.fn(), mirrorState: vi.fn(),
}));
vi.mock("./ticket-body", () => ({ composeTicketBodies: vi.fn(async () => ({ written: [], expected: 0, problems: [] })) }));

let produces: (string | null)[] = [];
let backlog: { kind: string; ref: string; title: string; ticket_key: string | null; parent_ref: string | null; ord: number; created_at: string }[] = [];
const updates: { table: string; set: Record<string, unknown> }[] = [];
const rpcs: { name: string; args: Record<string, unknown> }[] = [];

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      return { data: "run-1", error: null };
    },
    from: (table: string) => {
      let writing: Record<string, unknown> | null = null;
      // The open-run lookup is the only `workflow_run` read that orders; it finds none, so a run is opened.
      let ordered = false;
      const single: Record<string, unknown> = {
        workflow: { id: "wf-build", label: "Build" },
        workflow_version: { id: "ver-1" },
        workflow_run: { workflow_id: "wf-build", subject_ref: "E1-S1", parent_task_id: null },
      };
      const list: Record<string, unknown[]> = {
        workflow_step: produces.map((p) => ({ produces: p })),
        backlog_item: backlog,
        criterion: [],
        work_task: [],
      };
      const q: Record<string, unknown> = {
        select: () => q, eq: () => q, is: () => q, in: () => q, limit: () => q,
        order: () => { ordered = true; return q; },
        update: (set: Record<string, unknown>) => { writing = set; updates.push({ table, set }); return q; },
        maybeSingle: async () => ({ data: writing || (table === "workflow_run" && ordered) ? null : (single[table] ?? null) }),
        then: (res: (v: { data: unknown[]; error: null }) => void) => res({ data: list[table] ?? [], error: null }),
      };
      return q;
    },
  }),
}));

const { initiatePhase } = await import("./phases");
const actor = { engagementId: "e1", orgId: "org1", roleCode: "engineer", holder: "Om" };
const story = (over = {}) => ({
  kind: "story", ref: "E1-S1", title: "Apple sign-in", ticket_key: "CT-359", parent_ref: "E1", ord: 1,
  created_at: "2026-10-27T00:00:00Z", ...over,
});

beforeEach(() => {
  produces = ["{subject}@scm", "{subject}@scm"];
  backlog = [story()];
  updates.length = 0; rpcs.length = 0;
  mirrorEpicTasks.mockReset(); mirrorPhase.mockReset();
});

describe("starting a workflow about a story", () => {
  it("opens the run with the story as its subject and stores the story's TICKET as subject_key", async () => {
    const r = await initiatePhase(actor as never, "build", undefined, "E1-S1");
    expect(r.ok).toBe(true);
    expect(rpcs[0].args.p_subject_ref).toBe("E1-S1");
    expect(updates.find((u) => u.table === "workflow_run")?.set).toEqual({ subject_key: "CT-359" });
  });

  it("puts nothing on the board — the story is the ticket", async () => {
    const r = await initiatePhase(actor as never, "build", undefined, "E1-S1");
    expect(mirrorEpicTasks).not.toHaveBeenCalled();
    expect(mirrorPhase).not.toHaveBeenCalled();
    expect(r.ok && r.mirrored?.reason).toBe("nothing-to-mirror");
  });

  it("refuses to start without a story, naming the kind", async () => {
    const r = await initiatePhase(actor as never, "build");
    expect(r).toEqual({ ok: false, error: "Build is about one story. Choose which story to start it for." });
    expect(rpcs).toHaveLength(0);
  });

  it("refuses a story that does not exist, and opens nothing", async () => {
    const r = await initiatePhase(actor as never, "build", undefined, "E9-S9");
    expect(r).toEqual({ ok: false, error: "This engagement has no story 'E9-S9'." });
    expect(rpcs).toHaveLength(0);
  });

  it("refuses a story that is not on the board yet", async () => {
    backlog = [story({ ticket_key: null })];
    const r = await initiatePhase(actor as never, "build", undefined, "E1-S1");
    expect(r.ok).toBe(false);
    expect(rpcs).toHaveLength(0);
  });

  it("an epic workflow still hangs its tasks under the epic, unchanged", async () => {
    produces = ["03-architecture/epic/{epic}"];
    backlog = [{ ...story({ kind: "epic", ref: "E1", ticket_key: "CT-288", parent_ref: null }) }];
    mirrorEpicTasks.mockResolvedValue({ epic: "CT-288", stories: [], expected: 0, problems: [] });
    const r = await initiatePhase(actor as never, "build", undefined, "E1");
    expect(r.ok).toBe(true);
    expect(mirrorEpicTasks).toHaveBeenCalledTimes(1);
  });

  it("a workflow that is about nothing refuses a subject", async () => {
    produces = ["foundational-architecture"];
    const r = await initiatePhase(actor as never, "build", undefined, "E1-S1");
    expect(r).toEqual({ ok: false, error: "Build does not take a subject; start it without one." });
  });
});
