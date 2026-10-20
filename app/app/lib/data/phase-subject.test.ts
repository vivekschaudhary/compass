import { describe, it, expect, vi, beforeEach } from "vitest";

// A workflow a person starts directly can be about ONE epic (`refine-stories`). What is under test
// is the decision logic around that: a per-epic workflow cannot start without an epic, an epic that
// is not on the board is refused with a reason, one epic has one open run while another epic may
// have its own, and a run about an epic is not put on the board as a run of its own.

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({
  orgIdFor: async () => "org1", emit: async () => {}, emitRefusal: async () => {},
}));
vi.mock("./gates", () => ({
  remeasureRun: async () => {}, measureTask: async () => [], storedStatusFor: async () => new Map(), evaluate: async () => ({ state: "satisfied" }),
}));
vi.mock("./tasks", () => ({ startTask: async () => ({ ok: false, error: "not this test" }) }));
const mirrorPhase = vi.fn();
vi.mock("./tracker", () => ({
  mirrorPhase: (...a: unknown[]) => mirrorPhase(...a),
  mirrorNested: vi.fn(), mirrorState: vi.fn(),
}));
const composeTicketBodies = vi.fn(async () => ({ written: [], expected: 0, problems: [] }));
vi.mock("./ticket-body", () => ({ composeTicketBodies: (...a: unknown[]) => composeTicketBodies(...(a as [])) }));

type Row = Record<string, unknown>;
let db: Record<string, Row[]> = {};
const rpcCalls: { name: string; args: Row }[] = [];
let nextRun = 0;

function chainFor(table: string) {
  let rows: Row[] = db[table] ?? [];
  let patch: Row | null = null;
  const chain: Record<string, unknown> = {};
  const filter = (fn: (r: Row) => boolean) => { rows = rows.filter(fn); return chain; };
  chain.select = () => chain;
  chain.order = () => chain;
  chain.limit = (n: number) => { rows = rows.slice(0, n); return chain; };
  chain.eq = (col: string, val: unknown) => {
    if (patch) { for (const r of rows.filter((x) => x[col] === val)) Object.assign(r, patch); return chain; }
    return filter((r) => r[col] === val);
  };
  chain.is = (col: string, val: unknown) => filter((r) => (r[col] ?? null) === val);
  chain.update = (p: Row) => { patch = p; return chain; };
  chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
  chain.then = (res: (v: { data: Row[]; error: null }) => unknown) => res({ data: rows, error: null });
  return chain;
}

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => chainFor(table),
    rpc: async (name: string, args: Row) => {
      rpcCalls.push({ name, args });
      const id = `run-${++nextRun}`;
      db.workflow_run.push({
        id, engagement_id: args.p_engagement_id, workflow_id: "wf-refine", state: "open",
        parent_task_id: null, subject_ref: args.p_subject_ref ?? null, subject_key: null,
      });
      db.work_task.push(
        { id: `${id}-t1`, workflow_run_id: id, title: "Create stories for an epic", role_code: "product-owner", workflow_step: { ord: 1 } },
        { id: `${id}-t2`, workflow_run_id: id, title: "Approve the epic stories", role_code: "product-manager", workflow_step: { ord: 2 } },
      );
      return { data: id, error: null };
    },
  }),
}));

const { initiatePhase } = await import("./phases");

const actor = { engagementId: "e1", orgId: "org1", roleCode: "product-owner", holder: "Om" } as never;

beforeEach(() => {
  rpcCalls.length = 0;
  nextRun = 0;
  mirrorPhase.mockReset().mockResolvedValue({ epic: "CT-1", stories: [], expected: 0, problems: [] });
  db = {
    workflow: [
      { id: "wf-refine", code: "refine-stories", label: "Refine stories for each epic", org_id: "org1", enabled: true },
      { id: "wf-plain", code: "sprint-plan", label: "Sprint plan", org_id: "org1", enabled: true },
    ],
    workflow_version: [
      { id: "v-refine", workflow_id: "wf-refine", status: "published" },
      { id: "v-plain", workflow_id: "wf-plain", status: "published" },
    ],
    workflow_step: [
      { workflow_version_id: "v-refine", produces: "stories/{epic}" },
      { workflow_version_id: "v-refine", produces: null },
      { workflow_version_id: "v-plain", produces: "sprint-plans" },
    ],
    criterion: [],
    backlog_item: [
      { engagement_id: "e1", kind: "epic", ref: "ACC-E1", title: "Sign-in and account creation", ticket_key: "CT-288", created_at: "2" },
      { engagement_id: "e1", kind: "epic", ref: "LST-E1", title: "Create and edit a listing", ticket_key: "CT-290", created_at: "2" },
      { engagement_id: "e1", kind: "epic", ref: "RAT-E1", title: "Post-swap rating", ticket_key: null, created_at: "2" },
    ],
    workflow_run: [],
    work_task: [],
  };
});

describe("a per-epic workflow needs its epic", () => {
  it("refuses to start without one, and says which kind", async () => {
    const r = await initiatePhase(actor, "refine-stories");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/about one epic/);
    expect(rpcCalls).toEqual([]);
  });

  it("refuses an epic the engagement does not have", async () => {
    const r = await initiatePhase(actor, "refine-stories", undefined, "NOPE-E9");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no epic 'NOPE-E9'/);
  });

  it("refuses an epic that is not on the board yet, naming the fix", async () => {
    const r = await initiatePhase(actor, "refine-stories", undefined, "RAT-E1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not on the board yet — approve the epics first/);
    expect(rpcCalls).toEqual([]);
  });

  it("refuses a subject for a workflow that is not about one", async () => {
    const r = await initiatePhase(actor, "sprint-plan", undefined, "ACC-E1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/does not take a subject/);
  });
});

describe("opening a run for an epic", () => {
  it("passes the epic to the database and names it on the run", async () => {
    const r = await initiatePhase(actor, "refine-stories", undefined, "ACC-E1");
    expect(r.ok).toBe(true);
    expect(rpcCalls[0].args.p_subject_ref).toBe("ACC-E1");
    expect(db.workflow_run[0].subject_key).toBe("CT-288");
  });

  it("says which epic on each task, so nineteen runs are not nineteen identical lines", async () => {
    await initiatePhase(actor, "refine-stories", undefined, "ACC-E1");
    expect(db.work_task.map((t) => t.title)).toEqual([
      "Create stories for an epic — ACC-E1 Sign-in and account creation",
      "Approve the epic stories — ACC-E1 Sign-in and account creation",
    ]);
  });

  it("returns the open run when started again for the SAME epic, and opens nothing", async () => {
    const first = await initiatePhase(actor, "refine-stories", undefined, "ACC-E1");
    const again = await initiatePhase(actor, "refine-stories", undefined, "ACC-E1");
    expect(rpcCalls).toHaveLength(1);
    if (first.ok && again.ok) expect(again.runId).toBe(first.runId);
  });

  it("opens a separate run for ANOTHER epic while the first is open", async () => {
    const a = await initiatePhase(actor, "refine-stories", undefined, "ACC-E1");
    const b = await initiatePhase(actor, "refine-stories", undefined, "LST-E1");
    expect(rpcCalls).toHaveLength(2);
    if (a.ok && b.ok) expect(b.runId).not.toBe(a.runId);
  });

  it("opens a new run for an epic whose earlier run has closed — the workflow repeats", async () => {
    await initiatePhase(actor, "refine-stories", undefined, "ACC-E1");
    db.workflow_run[0].state = "closed";
    await initiatePhase(actor, "refine-stories", undefined, "ACC-E1");
    expect(rpcCalls).toHaveLength(2);
  });

  it("is not put on the board as a run — its stories are what reach the board", async () => {
    const r = await initiatePhase(actor, "refine-stories", undefined, "ACC-E1");
    expect(r.ok).toBe(true);
    expect(mirrorPhase).not.toHaveBeenCalled();
    expect(composeTicketBodies).not.toHaveBeenCalled();
  });
});

describe("a workflow with no subject is unchanged", () => {
  it("opens as before, with no subject, and is still put on the board", async () => {
    const r = await initiatePhase(actor, "sprint-plan");
    expect(r.ok).toBe(true);
    expect(rpcCalls[0].args.p_subject_ref).toBeNull();
    expect(mirrorPhase).toHaveBeenCalled();
  });

  it("is not mistaken for a subject run of the same workflow when one is open", async () => {
    db.workflow = [{ id: "wf-plain", code: "sprint-plan", label: "Sprint plan", org_id: "org1", enabled: true }];
    db.workflow_run.push({
      id: "run-x", engagement_id: "e1", workflow_id: "wf-plain", state: "open",
      parent_task_id: null, subject_ref: "ACC-E1", subject_key: null,
    });
    await initiatePhase(actor, "sprint-plan");
    // The only open run belongs to an epic, so the engagement-wide run still has to be opened.
    expect(rpcCalls).toHaveLength(1);
  });
});
