import { describe, it, expect, beforeEach, vi } from "vitest";

// `resetStalledRun` — the manual alternative to waiting for the sweep, or to a hand-written
// Postgres PATCH (which is what clearing a dead claim has meant every time this has come up so
// far). The one thing worth getting right here is the CAS: it must refuse on a row that only
// LOOKS stalled from a stale page read, not just accept whatever the caller believes.

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ emit: async () => {} }));
vi.mock("./links", () => ({ expandLinks: async (b: string) => b }));
vi.mock("./publish", () => ({ publishToDocs: async () => ({ ok: true, url: null, id: null }) }));

let workTaskRow: {
  executor: string | null; heartbeat_at: string | null; run_attempts: number;
  next_attempt_at: string | null;
};

function workTaskTable() {
  let requireExecutorNotNull = false;
  let ltHeartbeat: string | null = null;
  const q: {
    update: (patch: Record<string, unknown>) => typeof q;
    eq: () => typeof q;
    not: (col: string, op: string, val: unknown) => typeof q;
    lt: (col: string, val: string) => typeof q;
    select: () => Promise<{ data: unknown[] | null; error: null }>;
  } = {
    update: (patch) => {
      pendingPatch = patch;
      return q;
    },
    eq: () => q,
    not: (col, op, val) => {
      if (col === "executor" && op === "is" && val === null) requireExecutorNotNull = true;
      return q;
    },
    lt: (col, val) => {
      if (col === "heartbeat_at") ltHeartbeat = val;
      return q;
    },
    select: async () => {
      const executorOk = !requireExecutorNotNull || workTaskRow.executor !== null;
      const staleOk =
        ltHeartbeat === null ||
        (workTaskRow.heartbeat_at !== null && workTaskRow.heartbeat_at < ltHeartbeat);
      const passes = executorOk && staleOk;
      if (passes) Object.assign(workTaskRow, pendingPatch);
      return { data: passes ? [{ id: "t1" }] : [], error: null };
    },
  };
  let pendingPatch: Record<string, unknown> = {};
  return q;
}

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "work_task") return workTaskTable();
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const { resetStalledRun } = await import("./job");

const actor = { engagementId: "e1", orgId: "org1", roleCode: "staff-engineer", holder: "Alex", scope: "workstream" };

beforeEach(() => {
  workTaskRow = { executor: null, heartbeat_at: null, run_attempts: 3, next_attempt_at: "2099-01-01" };
});

describe("resetStalledRun", () => {
  it("refuses when the row isn't even claimed", async () => {
    const out = await resetStalledRun(actor as never, "t1");
    expect(out.ok).toBe(false);
  });

  it("refuses a claim whose heartbeat is still fresh — a live run, not a stalled one", async () => {
    workTaskRow.executor = "app";
    workTaskRow.heartbeat_at = new Date().toISOString();

    const out = await resetStalledRun(actor as never, "t1");

    expect(out.ok).toBe(false);
    expect(workTaskRow.executor).toBe("app"); // untouched
  });

  it("releases a claim whose heartbeat is genuinely stale, resetting the backoff too", async () => {
    workTaskRow.executor = "app";
    workTaskRow.heartbeat_at = new Date(Date.now() - 20 * 60_000).toISOString();

    const out = await resetStalledRun(actor as never, "t1");

    expect(out.ok).toBe(true);
    expect(workTaskRow.executor).toBeNull();
    expect(workTaskRow.heartbeat_at).toBeNull();
    expect(workTaskRow.run_attempts).toBe(0);
    expect(workTaskRow.next_attempt_at).toBeNull();
  });
});
