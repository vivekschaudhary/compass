import { describe, expect, it, vi, beforeEach } from "vitest";

// A gate is only as current as the last thing that measured it.
//
// The defect: the SOW was filed and published at 19:19, and `Timeline & Milestones` went on showing
// "No document at sow" from a measurement taken at 16:41. Nothing re-measured the rows a close
// unblocks — `measureTask` ran only from `initiatePhase`, `startTaskAction` and `recheckAction`.
//
// It is not a display problem. `start_task` refuses on `m.id is null or not m.satisfied`, so the
// stale row genuinely blocked the work, and the only cure was a person pressing re-check.
//
// The second guard here is the opposite direction: a CLOSED row must not be re-measured.
// `measureTask` deletes a measurement it can no longer evaluate, so re-measuring a finished row
// would clear the human attestations that closed it and make it read unfinished.

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

/** Every measurement written, in order — which rows were re-measured, and to what. */
let written: { task: string; satisfied: boolean; detail: string }[] = [];
const upserted = () => written.map((w) => w.task);
/** Refusals emitted, so "non-fatal" can be told apart from "silent". */
const refusals: { verb: string; reason: string }[] = [];
/** Made to fail, to prove a broken re-measure does not undo a close. */
let breakMeasurement = false;

vi.mock("./events", () => ({
  emit: async () => {},
  emitRefusal: async (r: { verb: string; reason: string }) => { refusals.push({ verb: r.verb, reason: r.reason }); },
  orgIdFor: async () => "org",
}));
vi.mock("./tracker", () => ({
  mirrorState: async () => ({ ok: true }),
  moveFailed: () => false,
}));
vi.mock("./materialise", () => ({ materialiseFrom: async () => null }));

vi.mock("../supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../supabase")>()),
  supabaseAdmin: () => ({
    from(table: keyof typeof db) {
      let rows = db[table] ?? [];
      const chain: Record<string, unknown> = {
        select: () => chain,
        // Filters are applied for real. A fake that ignored `neq` would return closed rows too and
        // pass the very test that exists to prove they are skipped.
        eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return chain; },
        neq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] !== v); return chain; },
        in: (col: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[col])); return chain; },
        order: () => chain,
        limit: () => chain,
        delete: () => chain,
        upsert: async (row: Row) => {
          if (table === "measurement") {
            if (breakMeasurement) throw new Error("connection reset");
            written.push({
              task: row.task_id as string,
              satisfied: row.satisfied as boolean,
              detail: (row.detail as string) ?? "",
            });
          }
          return { error: null };
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: { data: Row[]; error: null }) => unknown) => res({ data: rows, error: null }),
      };
      return chain;
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

const { remeasureRun, approve } = await import("./gates");

const actor = { engagementId: "eng", orgId: "org", roleCode: "delivery-manager", holder: "Vivek" } as never;

/** One published document at `sow`, and a criterion per step that checks it. */
function seed() {
  db.document = [{ id: "d1", engagement_id: "eng", path: "sow", current_version_id: "v1" }];
  db.document_version = [{ id: "v1", version: "1.0", status: "published" }];
  db.workflow_step = [
    { id: "s-draft", task: "draft-timeline" },
    { id: "s-review", task: "review-timeline" },
    { id: "s-sow", task: "file-sow" },
    { id: "s-nest", task: "draft-timeline-nesting" },
  ];
  db.criterion = [
    { id: "c-sow", workflow_version_id: "wv1", kind: "ready", step_task: null, ord: 1,
      statement: "sow is published — timeline reads it.",
      subject_kind: "document", subject_ref: "sow", operator: "status", value: "published" },
  ];
  db.workflow_run = [
    { id: "run-parent", parent_task_id: null },
    { id: "run-child", parent_task_id: "t-nest" },
  ];
  const run = (id: string) => ({ workflow_run: { workflow_version_id: "wv1" }, workflow_run_id: id });
  db.work_task = [
    { id: "t-sow", state: "closed", workflow_step_id: "s-sow", engagement_id: "eng", ...run("run-parent") },
    { id: "t-review", state: "idle", workflow_step_id: "s-review", engagement_id: "eng", ...run("run-parent") },
    { id: "t-nest", state: "running", workflow_step_id: "s-nest", engagement_id: "eng", ...run("run-parent") },
    { id: "t-draft", state: "idle", workflow_step_id: "s-draft", engagement_id: "eng", ...run("run-child") },
  ];
  db.measurement = [];
}

beforeEach(() => { seed(); written = []; refusals.length = 0; breakMeasurement = false; });

describe("remeasureRun", () => {
  it("measures every open row of the run", async () => {
    await remeasureRun(actor, "run-parent");
    expect(new Set(upserted())).toEqual(new Set(["t-review", "t-nest"]));
  });

  // The guard, not the feature. A closed row's Done criteria carry human attestations, and
  // measureTask clears what it cannot evaluate.
  it("leaves closed rows alone", async () => {
    await remeasureRun(actor, "run-parent");
    expect(upserted()).not.toContain("t-sow");
  });

  it("measures the rows of THIS run only", async () => {
    await remeasureRun(actor, "run-child");
    expect(upserted()).toEqual(["t-draft"]);
  });

  // The whole point, in one assertion: the published SOW is what lands on the row, not a stale no.
  it("writes the verdict the published document supports", async () => {
    await remeasureRun(actor, "run-child");
    expect(written).toEqual([
      { task: "t-draft", satisfied: true, detail: "sow is published at v1.0." },
    ]);
  });

  // The failure mode it was born from, run the other way: with nothing filed, the same call must
  // write the honest no rather than nothing at all.
  it("writes an unsatisfied verdict when the document is not there", async () => {
    db.document = [];
    await remeasureRun(actor, "run-child");
    expect(written).toEqual([
      { task: "t-draft", satisfied: false, detail: "No document at sow." },
    ]);
  });
});

describe("closing a row re-measures the rows it unblocks", () => {
  // The regression. `file-sow` closes; `review-timeline`, waiting on `sow`, must be re-measured
  // without anyone pressing re-check.
  it("re-measures the siblings of the row that closed", async () => {
    const r = await approve(actor, "t-review", []);
    expect(r.ok).toBe(true);
    expect(upserted()).toContain("t-nest");
  });

  // One hop up: the last row of a nested run closing is when the nesting row's Done gate can first
  // see the child's output.
  it("re-measures the parent run as well, when the row is in a nested run", async () => {
    const r = await approve(actor, "t-draft", []);
    expect(r.ok).toBe(true);
    expect(upserted()).toContain("t-review");   // a row of run-parent, reached through t-nest
  });

  // Never fatal, never silent. These are network calls; a broken provider must not undo a close the
  // human already made, and must not vanish either.
  it("does not fail the close when re-measuring throws, and says so", async () => {
    const r = await approve(actor, "t-review", []);
    expect(r.ok).toBe(true);

    written = [];
    breakMeasurement = true;
    const broken = await approve(actor, "t-review", []);
    expect(broken.ok).toBe(true);
    expect(refusals.map((x) => x.verb)).toContain("task.remeasure_incomplete");
    expect(refusals.at(-1)!.reason).toContain("connection reset");
  });
});
