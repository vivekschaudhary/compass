import { describe, it, expect, vi, beforeEach } from "vitest";

// What an agent is shown as its inputs must be what the page shows the person. For a per-epic
// workflow a declared read names the run's subject, and it has to be filled in the same way.

vi.mock("server-only", () => ({}));
vi.mock("../specs", () => ({ resolveSpec: async () => null, resolveSpecFromTable: async () => null, COMPASS_DIR: "/nowhere" }));
vi.mock("../adapters", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../adapters")>()),
  destinationOf: (p: string) => ({ path: p, slot: "docs" }),
}));

type Row = Record<string, unknown>;

/** Rows by table, and every update the code under test performed. */
const db: Record<string, Row[]> = {};
const updates: { table: string; patch: Row; nullOnly: boolean }[] = [];
const upserts: Row[] = [];
const deletes: { table: string; where: Row }[] = [];

function client() {
  const query = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let nullOnly = false;
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return api; },
      in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return api; },
      is: (col: string, val: unknown) => {
        if (val === null) nullOnly = true;
        filters.push((r) => (r[col] ?? null) === val);
        return api;
      },
      order: () => api,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      update: (patch: Row) => {
        const u = {
          eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return u; },
          is: (col: string, val: unknown) => {
            if (val === null) nullOnly = true;
            filters.push((r) => (r[col] ?? null) === val);
            return u;
          },
          then: (resolve: (v: unknown) => unknown) => {
            updates.push({ table, patch, nullOnly });
            for (const r of rows()) Object.assign(r, patch);
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return u;
      },
      upsert: async (r: Row | Row[]) => {
        const list = Array.isArray(r) ? r : [r];
        upserts.push(...list);
        db[table] = [...(db[table] ?? []), ...list];
        return { error: null };
      },
      delete: () => {
        const where: Row = {};
        const d = {
          eq: (col: string, val: unknown) => { where[col] = val; filters.push((r) => r[col] === val); return d; },
          then: (resolve: (v: unknown) => unknown) => {
            deletes.push({ table, where });
            if (db[table]) db[table] = db[table].filter((r) => !filters.every((f) => f(r)));
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return d;
      },
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null, count: rows().length }).then(resolve),
    };
    const rows = () => (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
    return api;
  };
  return { from: query };
}

vi.mock("../supabase", () => ({
  supabaseAdmin: () => client(),
  must: (_label: string, res: { data: unknown }) => res.data,
}));

const { buildContext } = await import("./context");

const actor = {
  orgId: "org", engagementId: "eng", roleCode: "product-manager", roleLabel: "PM",
  holder: null, scope: "everyone" as const, workstreamCode: null, agent: null,
  tier: "oversight", capabilities: [],
};

beforeEach(() => {
  updates.length = 0;
  upserts.length = 0;
  deletes.length = 0;
  for (const k of Object.keys(db)) delete db[k];
  db.work_task = [{ id: "t1", engagement_id: "eng", title: "Approve the stories", subtitle: "", role_code: "product-manager", workflow_step_id: "s1", workflow_run_id: "run1", subject_ref: null }];
  db.workflow_step = [{ id: "s1", produces: null, reads: ["stories/{epic}"], renders: "doc-review" }];
  db.workflow_run = [{ id: "run1", subject_ref: "ACC-E1", subject_key: "CT-288" }];
  db.task_input = [];
  db.document = [];
  db.document_version = [];
  db.role = [{ org_id: "org", code: "product-manager", agent: null }];
  db.criterion = [];
  db.workflow = [];
  db.document_section = [];
});


const filedStories = () => {
  db.document = [{ id: "d1", path: "stories/CT-288", title: "Stories", current_version_id: "v1", engagement_id: "eng" }];
  db.document_version = [{ id: "v1", version: "1", document_id: "d1" }];
  db.document_section = [{ document_version_id: "v1", heading: "ACC-E1-S1 — Sign in", body: "the story", ord: 0 }];
};

// A review row of a per-epic workflow declares `stories/{epic}`. The page resolves that path for its
// review panel; the agent's pinned inputs did not, so the person saw the draft and the agent was
// told it had never been written, and asked whether the author had run yet.
describe("a read that names the run's subject", () => {
  it("is pinned under the path it resolves to, not the token", async () => {
    filedStories();
    await buildContext(actor, "t1");
    expect(upserts.map((r) => r.document_path)).toEqual(["stories/CT-288"]);
  });

  it("reaches the agent with its text", async () => {
    filedStories();
    const ctx = await buildContext(actor, "t1");
    expect(ctx?.inputs).toHaveLength(1);
    expect(ctx?.inputs[0].path).toBe("stories/CT-288");
    expect(ctx?.inputs[0].body).toContain("the story");
  });

  it("is still reported absent when the document has not been filed — with the real path", async () => {
    const ctx = await buildContext(actor, "t1");
    expect(ctx?.inputs[0].path).toBe("stories/CT-288");
    expect(ctx?.inputs[0].body).toBeNull();
  });

  it("keeps the literal path when the run has no subject to fill it with", async () => {
    db.workflow_run = [{ id: "run1", subject_ref: null, subject_key: null }];
    await buildContext(actor, "t1");
    expect(upserts.map((r) => r.document_path)).toEqual(["stories/{epic}"]);
  });
});

describe("a pin recorded before the subject was resolved", () => {
  it("is re-pointed at the real path, and the document then reaches the agent", async () => {
    filedStories();
    db.task_input = [{ task_id: "t1", document_path: "stories/{epic}", document_version: null }];

    const ctx = await buildContext(actor, "t1");

    expect(db.task_input.map((r) => r.document_path)).toEqual(["stories/CT-288"]);
    expect(ctx?.inputs[0].path).toBe("stories/CT-288");
    expect(ctx?.inputs[0].body).toContain("the story");
  });

  it("is dropped when the resolved pin is already there, rather than colliding with it", async () => {
    filedStories();
    db.task_input = [
      { task_id: "t1", document_path: "stories/{epic}", document_version: null },
      { task_id: "t1", document_path: "stories/CT-288", document_version: "1" },
    ];
    await buildContext(actor, "t1");
    expect(db.task_input.map((r) => r.document_path)).toEqual(["stories/CT-288"]);
  });

  it("leaves a pin that already names a version alone, whatever its path", async () => {
    filedStories();
    db.task_input = [{ task_id: "t1", document_path: "stories/{epic}", document_version: "1" }];
    await buildContext(actor, "t1");
    expect(db.task_input.map((r) => r.document_path)).toEqual(["stories/{epic}"]);
  });
});
