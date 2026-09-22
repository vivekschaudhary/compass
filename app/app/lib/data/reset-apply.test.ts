import { describe, it, expect, vi, beforeEach } from "vitest";

// Carrying out a reset — the half `reset.test.ts` deliberately does not cover.
//
// `planReset` decides; this decides nothing, and everything that can go wrong here is about the
// WRITES: that a report writes nothing at all, that `document.current_version_id` is nulled before
// the document rows go (it references `document_version` with no `on delete` rule), that the
// deletes run in the order the plan put them in, and that a long list is chunked rather than put in
// one URL PostgREST will reject.
//
// It matters twice over now: `scripts/reset-engagement.mts` and `POST /api/cleanup` both call this,
// so a defect here is a defect in both front doors.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const db: { work_task: Row[]; workflow_run: Row[]; document: Row[]; event: Row[]; engagement: Row[] } = {
  work_task: [], workflow_run: [], document: [], event: [], engagement: [],
};

/** Every write, in order — the sequence IS the assertion for most of these. */
let ops: string[] = [];
/** The id lists each delete was given, to see the chunking. */
let deleteSizes: Record<string, number[]> = {};

vi.mock("../supabase.ts", () => ({
  supabaseAdmin: () => ({
    from(table: keyof typeof db) {
      let rows = db[table] ?? [];
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return chain; },
        in: (_col: string, ids: unknown[]) => {
          const last = ops[ops.length - 1];
          if (last?.startsWith(`delete ${table}`)) {
            (deleteSizes[table] ??= []).push(ids.length);
          }
          if (last?.startsWith(`update ${table}`)) {
            (deleteSizes[`update:${table}`] ??= []).push(ids.length);
          }
          return chain;
        },
        delete: () => { ops.push(`delete ${table}`); return chain; },
        update: () => { ops.push(`update ${table}.current_version_id`); return chain; },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: { data: Row[]; error: null }) => unknown) => res({ data: rows, error: null }),
      };
      return chain;
    },
  }),
}));

const { resetEngagement, engagementsToReset, snapshotEngagement } = await import("./reset-apply");

function seed({ tasks = 1, docs = 1 }: { tasks?: number; docs?: number } = {}) {
  db.engagement = [{ id: "e1", name: "Acme" }, { id: "e2", name: "Other" }];
  db.work_task = Array.from({ length: tasks }, (_, i) => ({
    id: `t${i}`, engagement_id: "e1", workflow_run_id: "r1",
  }));
  db.workflow_run = [{ id: "r1", engagement_id: "e1" }];
  db.document = Array.from({ length: docs }, (_, i) => ({
    id: `d${i}`, engagement_id: "e1", path: "sow", external_url: null,
  }));
  db.event = [
    { id: "ev1", engagement_id: "e1", verb: "engagement.created" },
    { id: "ev2", engagement_id: "e1", verb: "task.closed" },
  ];
}

beforeEach(() => { ops = []; deleteSizes = {}; seed(); });

describe("choosing what to reset", () => {
  it("returns every engagement when given no id", async () => {
    const r = await engagementsToReset(null);
    expect(r.ok && r.targets.map((t) => t.id)).toEqual(["e1", "e2"]);
  });

  it("names the ones that exist when the id does not", async () => {
    // The id is usually a typo, and a bare "not found" makes someone go looking for the list.
    const r = await engagementsToReset("nope");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("e1");
    expect(r.error).toContain("e2");
  });

  it("reads only the engagement it was asked about", async () => {
    const snap = await snapshotEngagement("e1");
    expect(snap.tasks).toHaveLength(1);
    expect(snap.engagementId).toBe("e1");
  });
});

describe("a report", () => {
  it("writes NOTHING", async () => {
    // The whole value of the dry run. If it wrote, "re-run with --apply" would be a lie and the
    // report would be the destruction.
    const r = await resetEngagement("e1", "Acme", { apply: false });
    expect(r.ok && r.cleared).toBe(false);
    expect(ops).toEqual([]);
  });

  it("still says what it would delete", async () => {
    const r = await resetEngagement("e1", "Acme", { apply: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.deletes.map((d) => d.table)).toContain("work_task");
  });
});

describe("applying it", () => {
  it("nulls current_version_id BEFORE deleting documents", async () => {
    // `document.current_version_id` references `document_version` with no `on delete` rule, so the
    // order decides whether the cascade is unambiguous or depends on how Postgres sequences one
    // statement that takes a parent and the row it points at.
    await resetEngagement("e1", "Acme", { apply: true });
    expect(ops.indexOf("update document.current_version_id"))
      .toBeLessThan(ops.indexOf("delete document"));
  });

  it("deletes tasks before the runs they belong to", async () => {
    await resetEngagement("e1", "Acme", { apply: true });
    expect(ops.indexOf("delete work_task")).toBeLessThan(ops.indexOf("delete workflow_run"));
  });

  it("reports that it cleared", async () => {
    const r = await resetEngagement("e1", "Acme", { apply: true });
    expect(r.ok && r.cleared).toBe(true);
  });

  // PostgREST puts `in.(…)` in the URL. A few thousand uuids exceeds what the server accepts, and
  // the failure only ever appears on the one engagement big enough to reach it.
  it("chunks a long list rather than sending one enormous request", async () => {
    seed({ tasks: 450, docs: 0 });
    await resetEngagement("e1", "Acme", { apply: true });
    expect(deleteSizes.work_task).toEqual([200, 200, 50]);
  });

  it("chunks the current_version_id update the same way", async () => {
    seed({ tasks: 1, docs: 250 });
    await resetEngagement("e1", "Acme", { apply: true });
    expect(deleteSizes["update:document"]).toEqual([200, 50]);
  });

  it("refuses an engagement that holds nothing, rather than reporting a clean sweep", async () => {
    // An empty engagement is nearly always a wrong id. Saying "cleared 0 rows" would read as
    // success to whoever typed it.
    db.work_task = []; db.workflow_run = []; db.document = []; db.event = [];
    const r = await resetEngagement("e1", "Acme", { apply: true });
    expect(r.ok).toBe(false);
    expect(ops).toEqual([]);
  });
});
