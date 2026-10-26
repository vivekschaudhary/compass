import { describe, it, expect, vi, beforeEach } from "vitest";

// Resolving and carrying out a top-level run's reset — the half `reset-workflow.test.ts` does not
// cover. What goes wrong here is about WHICH run a ref names: a nested run must never be claimed by
// this path, an ambiguous ref must not pick one, and nothing may be written on a report.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
let ops: string[] = [];

vi.mock("../supabase.ts", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let rows = db[table] ?? [];
      let mode: "read" | "delete" | "update" = "read";
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return chain; },
        is: (col: string, v: unknown) => { rows = rows.filter((r) => (r[col] ?? null) === v); return chain; },
        not: () => chain,
        in: (col: string, ids: unknown[]) => {
          rows = rows.filter((r) => ids.includes(r[col]));
          if (mode === "delete") ops.push(`delete ${table} ${rows.length}`);
          if (mode === "update") ops.push(`update ${table} ${rows.length}`);
          return chain;
        },
        delete: () => { mode = "delete"; return chain; },
        update: () => { mode = "update"; return chain; },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: { data: Row[]; error: null }) => void) => res({ data: rows, error: null }),
      };
      return chain;
    },
  }),
}));
vi.mock("./actor.ts", () => ({ resolveActor: async () => null }));
vi.mock("./gates.ts", () => ({ measureTask: async () => [] }));

import { resolveTopLevelRuns, resetWorkflow } from "./reset-workflow-apply";

const RUN = "224b50da-2a6d-4ee1-bf71-b042fe1e2789";
const run = (over: Row = {}): Row => ({
  id: RUN, engagement_id: "e1", state: "open", parent_task_id: null,
  subject_ref: "ACC-E1", subject_key: "CT-288", workflow: { code: "tech-design" }, ...over,
});

beforeEach(() => {
  ops = [];
  for (const k of Object.keys(db)) delete db[k];
  db.workflow_run = [run()];
  db.work_task = [
    { id: "t1", workflow_run_id: RUN, ticket_key: "CT-353", engagement_id: "e1", workflow_step: null },
    { id: "t2", workflow_run_id: RUN, ticket_key: "CT-354", engagement_id: "e1", workflow_step: null },
  ];
  db.document_version = []; db.document = []; db.event = [];
});

describe("which run a ref names", () => {
  it("a run id", async () => {
    const r = await resolveTopLevelRuns("e1", RUN);
    expect(r.ok && r.workflowCode).toBe("tech-design");
  });

  it("<workflow code>:<epic key> or :<epic ref>", async () => {
    for (const ref of ["tech-design:CT-288", "tech-design:ACC-E1"]) {
      const r = await resolveTopLevelRuns("e1", ref);
      expect(r.ok && r.runs.map((x) => x.id), ref).toEqual([RUN]);
    }
  });

  it("does not match another workflow's run for the same epic, or another epic's", async () => {
    expect((await resolveTopLevelRuns("e1", "refine-stories:CT-288")).ok).toBe(false);
    expect((await resolveTopLevelRuns("e1", "tech-design:CT-289")).ok).toBe(false);
  });

  it("never claims a run that a nesting row opened", async () => {
    db.workflow_run = [run({ parent_task_id: "some-nesting-task" })];
    expect((await resolveTopLevelRuns("e1", RUN)).ok).toBe(false);
    expect((await resolveTopLevelRuns("e1", "tech-design:CT-288")).ok).toBe(false);
  });

  it("is scoped to the engagement", async () => {
    expect((await resolveTopLevelRuns("other", RUN)).ok).toBe(false);
  });

  it("an ambiguous <code>:<subject> does not pick one — it names them", async () => {
    db.workflow_run = [run(), run({ id: "aaaaaaaa-0000-0000-0000-000000000001", state: "closed" })];
    const r = await resolveTopLevelRuns("e1", "tech-design:CT-288");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("aaaaaaaa-0000-0000-0000-000000000001");
    // …but a run id is always unambiguous.
    expect((await resolveTopLevelRuns("e1", RUN)).ok).toBe(true);
  });

  it("a ref that is neither shape is refused with the two shapes", async () => {
    const r = await resolveTopLevelRuns("e1", "tech-design");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("tech-design:CT-288");
  });
});

describe("resetWorkflow on a top-level run", () => {
  it("a report writes nothing", async () => {
    const r = await resetWorkflow("e1", "tech-design:CT-288", { apply: false });
    expect(r.ok && r.kind).toBe("run");
    expect(r.ok && r.cleared).toBe(false);
    expect(ops).toEqual([]);
  });

  it("applying deletes the tasks before the run, and reports the tickets it leaves behind", async () => {
    const r = await resetWorkflow("e1", "tech-design:CT-288", { apply: true });
    expect(r.ok && r.cleared).toBe(true);
    expect(ops.indexOf("delete work_task 2")).toBeGreaterThanOrEqual(0);
    expect(ops.indexOf("delete work_task 2")).toBeLessThan(ops.indexOf("delete workflow_run 1"));
    if (r.ok && r.kind === "run") expect(r.plan.ticketsLeftInTracker).toEqual(["CT-353", "CT-354"]);
  });

  it("refuses a phase run (no subject) and writes nothing", async () => {
    db.workflow_run = [run({ subject_ref: null, subject_key: null })];
    const r = await resetWorkflow("e1", RUN, { apply: true });
    expect(r.ok).toBe(false);
    expect(ops).toEqual([]);
  });

  it("when the ref is neither a nesting row nor a run, says why for both", async () => {
    const r = await resetWorkflow("e1", "tech-design:CT-999", { apply: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusals).toHaveLength(2);
    expect(ops).toEqual([]);
  });
});
