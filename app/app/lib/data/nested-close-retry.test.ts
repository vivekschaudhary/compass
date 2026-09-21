import { describe, expect, it, vi, beforeEach } from "vitest";

// A nesting row closes when its nested run's output lands — not four seconds before it.
//
// The defect, from the live engagement: `close_parent_task_when_child_run_closes` calls `close_task`
// from inside the CHILD's transaction, and `close_task` measures nothing — it reads `measurement`
// rows, which are written here in Node, by connectors, AFTER that transaction commits. So the
// trigger can only ever see measurements taken BEFORE the child closed. At 18:57:55 it refused
// `Timeline & Milestones` with "timeline is published (not met: No document at timeline)"; at
// 18:58:00 the re-measure wrote "timeline is published at v1.0". Nothing retried, so the row sat
// open with a fully green Done gate and CT-151 stuck at In Progress.
//
// For a row whose Done gate depends on what its child produced — which is every nesting row worth
// having — that first attempt is not unlucky, it is guaranteed to fail. The retry is the fix.
//
// The guards matter as much as the feature, and each has its own case below: only nesting rows
// close this way (an ordinary row's green Done gate is the HITL gate, and a person presses it),
// never with a child run still open, and never over zero child runs — "every run has closed" is
// true of none, which is AGENTS.md rule 11 in its purest form.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const db: {
  work_task: Row[];
  workflow_run: Row[];
  workflow_step: Row[];
  criterion: Row[];
  document: Row[];
  document_version: Row[];
  measurement: Row[];
} = {
  work_task: [], workflow_run: [], workflow_step: [], criterion: [],
  document: [], document_version: [], measurement: [],
};

/** Which tasks were measured, in order. */
let measured: string[] = [];
/** Every `close_task` call, so "it closed the right row" is a claim about the row. */
let closed: { task: string; actor: string }[] = [];
/** Made to fail, to prove the ticket is put back rather than left reading Done. */
let closeError: string | null = null;
/** Tracker moves, in order — the board closes FIRST, and a test can see that it did. */
let moves: { task: string; to: string }[] = [];
let trackerRefuses = false;
const events: { verb: string; actorKind?: string }[] = [];
const refusals: { verb: string; reason: string }[] = [];

vi.mock("./events", () => ({
  emit: async (e: { verb: string; actorKind?: string }) => { events.push({ verb: e.verb, actorKind: e.actorKind }); },
  emitRefusal: async (r: { verb: string; reason: string }) => { refusals.push({ verb: r.verb, reason: r.reason }); },
  orgIdFor: async () => "org",
}));
vi.mock("./tracker", () => ({
  mirrorState: async (_eng: string, taskId: string, to: string) => {
    moves.push({ task: taskId, to });
    return trackerRefuses && to === "closed"
      ? { ok: false, reason: "no-status", note: "Project CT has no Done status." }
      : { ok: true };
  },
  moveFailed: (m: { ok: boolean }) => !m.ok,
}));
vi.mock("./materialise", () => ({ materialiseFrom: async () => null }));

vi.mock("../supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../supabase")>()),
  supabaseAdmin: () => ({
    from(table: keyof typeof db) {
      let rows = db[table] ?? [];
      let deleting = false;
      const chain: Record<string, unknown> = {
        select: () => chain,
        // Filters run for real. A fake that ignored `eq("parent_task_id", …)` would hand every
        // row's child runs to every row and pass the tests that exist to prove otherwise.
        eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return chain; },
        neq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] !== v); return chain; },
        in: (col: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[col])); return chain; },
        order: () => chain,
        limit: () => chain,
        delete: () => { deleting = true; return chain; },
        // Measurements are WRITTEN, not just counted. The retry reads them back, so a fake that
        // only tallied the call would test the measure and never the close that depends on it —
        // which is the whole seam this file exists for.
        upsert: async (row: Row) => {
          if (table !== "measurement") return { error: null };
          measured.push(row.task_id as string);
          db.measurement = db.measurement.filter(
            (m) => !(m.task_id === row.task_id && m.criterion_id === row.criterion_id),
          );
          db.measurement.push(row);
          return { error: null };
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: { data: Row[]; error: null }) => unknown) => {
          if (deleting) {
            const gone = new Set(rows);
            db[table] = (db[table] ?? []).filter((r) => !gone.has(r));
          }
          return res({ data: rows, error: null });
        },
      };
      return chain;
    },
    rpc: async (fn: string, args: Record<string, string>) => {
      if (fn !== "close_task") return { data: null, error: null };
      if (closeError) return { data: null, error: { message: closeError } };
      closed.push({ task: args.p_task_id, actor: args.p_actor });
      return { data: null, error: null };
    },
  }),
}));

const { remeasureRun, closeNestingRowIfSatisfied } = await import("./gates");

const actor = { engagementId: "eng", orgId: "org", roleCode: "delivery-manager", holder: "Joe" } as never;

/**
 * The live shape, reduced: a nesting row in the setup run, its closed child run, and the document
 * that child produced — published, as it is by the time anything re-measures.
 */
function seed() {
  db.document = [{ id: "d1", engagement_id: "eng", path: "timeline", current_version_id: "v1" }];
  db.document_version = [{ id: "v1", version: "1.0", status: "published" }];
  db.workflow_step = [
    { id: "s-nest", task: "timeline", nests_workflow_code: "timeline" },
    { id: "s-plain", task: "draft-sow", nests_workflow_code: null },
  ];
  db.criterion = [
    { id: "c-pub", workflow_version_id: "wv1", kind: "done", step_task: null, ord: 1,
      statement: "timeline is published.",
      subject_kind: "document", subject_ref: "timeline", operator: "status", value: "published" },
  ];
  db.workflow_run = [
    { id: "run-setup", parent_task_id: null, state: "running" },
    { id: "run-child", parent_task_id: "t-nest", state: "closed" },
  ];
  const run = (id: string) => ({ workflow_run: { workflow_version_id: "wv1" }, workflow_run_id: id });
  db.work_task = [
    { id: "t-nest", state: "running", role_code: "delivery-manager",
      workflow_step_id: "s-nest", engagement_id: "eng", ...run("run-setup") },
  ];
  db.measurement = [];
}

beforeEach(() => {
  seed();
  measured = []; closed = []; moves = [];
  closeError = null; trackerRefuses = false;
  events.length = 0; refusals.length = 0;
});

describe("the retry a re-measure makes possible", () => {
  // The regression, in one assertion.
  it("closes the nesting row once the measurements catch up", async () => {
    await remeasureRun(actor, "run-setup");
    expect(measured).toContain("t-nest");
    expect(closed.map((c) => c.task)).toEqual(["t-nest"]);
  });

  // Not a person, and the record must not claim one. `close_task` hardcodes its actor kind, so the
  // honest statement is the event this writes alongside it.
  it("records the close as the system's, not a human's", async () => {
    await remeasureRun(actor, "run-setup");
    expect(closed[0].actor).toBe("system");
    expect(events).toContainEqual({ verb: "task.satisfied_by_child_run", actorKind: "system" });
  });

  // The order `approve` establishes and the reason for it: the tracker holds the status of record,
  // so closing here first would leave Jira reading In Progress with no arbiter between them.
  it("moves the board before it closes the row", async () => {
    await remeasureRun(actor, "run-setup");
    expect(moves).toEqual([{ task: "t-nest", to: "closed" }]);
  });

  it("does not close a row whose Done criterion is not met", async () => {
    db.document = [];            // nothing published at `timeline`
    await remeasureRun(actor, "run-setup");
    expect(measured).toContain("t-nest");
    expect(closed).toEqual([]);
  });

  // The HITL gate is not bypassed. An ordinary row's Done criteria going green is precisely the
  // moment a person is asked to approve it — closing it here would answer for them.
  it("leaves an ordinary row alone, however green its gate", async () => {
    db.work_task = [{ id: "t-plain", state: "hitl", role_code: "delivery-manager",
      workflow_step_id: "s-plain", engagement_id: "eng",
      workflow_run: { workflow_version_id: "wv1" }, workflow_run_id: "run-setup" }];
    await remeasureRun(actor, "run-setup");
    expect(measured).toContain("t-plain");
    expect(closed).toEqual([]);
  });

  it("will not close while a child run is still open", async () => {
    db.workflow_run = [
      { id: "run-setup", parent_task_id: null, state: "running" },
      { id: "run-child", parent_task_id: "t-nest", state: "closed" },
      { id: "run-child-2", parent_task_id: "t-nest", state: "running" },
    ];
    await remeasureRun(actor, "run-setup");
    expect(closed).toEqual([]);
  });

  // Rule 11. "Every run this row opened has closed" is TRUE of no runs, and a row whose work was
  // never opened would close on the strength of it.
  it("will not close a row that has opened no run at all", async () => {
    db.workflow_run = [{ id: "run-setup", parent_task_id: null, state: "running" }];
    await remeasureRun(actor, "run-setup");
    expect(closed).toEqual([]);
  });

  // `close_task` refuses a row that never started, and this must not be the thing that discovers it.
  it("will not close a row nobody has started", async () => {
    db.work_task[0].state = "idle";
    await remeasureRun(actor, "run-setup");
    expect(closed).toEqual([]);
  });

  // One hop up: closing this row may close the run holding it, which fires the same trigger on ITS
  // parent with the same stale measurements. Walking up here is what stops the cascade one short.
  it("re-measures the run one level up after it closes a row", async () => {
    db.workflow_run.push({ id: "run-grand", parent_task_id: null, state: "running" });
    db.work_task.push({ id: "t-grand", state: "running", role_code: "delivery-manager",
      workflow_step_id: "s-plain", engagement_id: "eng",
      workflow_run: { workflow_version_id: "wv1" }, workflow_run_id: "run-grand" });
    db.workflow_run.find((r) => r.id === "run-setup")!.parent_task_id = "t-grand";

    await remeasureRun(actor, "run-setup");
    expect(closed.map((c) => c.task)).toEqual(["t-nest"]);
    expect(measured).toContain("t-grand");
  });
});

describe("closing a nesting row by hand", () => {
  // Called directly, as the button calls it — on measurements already on the record.
  const met = () => { db.measurement = [{ task_id: "t-nest", criterion_id: "c-pub", satisfied: true }]; };

  // The escape hatch the UI presses. It succeeds on the same evidence the retry uses.
  it("closes it when the gate is green", async () => {
    met();
    expect(await closeNestingRowIfSatisfied(actor, "t-nest")).toEqual({ closed: true });
  });

  // The refusal is the useful half: it names the criterion, because "2 of 3 met" sends someone
  // hunting for which one. An UNMEASURED criterion refuses exactly like a failed one — nobody
  // checked is not the same as it passed.
  it("names the criterion that is not met", async () => {
    const r = await closeNestingRowIfSatisfied(actor, "t-nest");
    expect(r).toEqual({ closed: false, why: "Not done:\n  timeline is published." });
  });

  it("says so when the nested run is still open", async () => {
    met();
    db.workflow_run.find((r) => r.id === "run-child")!.state = "running";
    const r = await closeNestingRowIfSatisfied(actor, "t-nest");
    expect(r).toEqual({ closed: false, why: "The timeline run is still open." });
  });

  // The board would not take it. A different problem from the gate refusing, and it must read as
  // one — the work was accepted and the tracker said no.
  it("does not close the row when the tracker refuses the move", async () => {
    trackerRefuses = true;
    db.measurement = [{ task_id: "t-nest", criterion_id: "c-pub", satisfied: true }];
    const r = await closeNestingRowIfSatisfied(actor, "t-nest");
    expect(r).toEqual({ closed: false, why: "Project CT has no Done status." });
    expect(closed).toEqual([]);
    expect(refusals.map((x) => x.verb)).toContain("task.close_blocked_by_tracker");
  });

  // The ticket moved and then the gate said no. Leaving the board reading Done for a row Compass
  // will not close is the two-answers problem again, pointing the other way.
  it("puts the ticket back when the database refuses the close", async () => {
    db.measurement = [{ task_id: "t-nest", criterion_id: "c-pub", satisfied: true }];
    closeError = "Not done:\n  timeline is published. (not checked)";
    const r = await closeNestingRowIfSatisfied(actor, "t-nest");
    expect(r.closed).toBe(false);
    expect(moves).toEqual([
      { task: "t-nest", to: "closed" },
      { task: "t-nest", to: "hitl" },
    ]);
    expect(refusals.map((x) => x.verb)).toContain("task.child_run_closed_gate_not_met");
  });
});
