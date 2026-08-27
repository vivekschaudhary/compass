import { describe, it, expect, vi, beforeEach } from "vitest";

// A supplied document has to reach the agent that asked for it.
//
// The task pins its declared inputs when work begins. A document that did not exist yet is pinned
// with a null version — an absence, deliberately recorded. `buildContext` must then resolve that
// absence once the document arrives, or an agent asks the human for the BRD, the human supplies it,
// and the next run is told the input is still missing: the answer reaches the record and never
// reaches the agent.
//
// What must NOT happen is a pin that already names a version being moved. That is provenance, and
// rewriting it would change what a finished draft was derived from.

vi.mock("server-only", () => ({}));
vi.mock("../specs", () => ({ resolveSpec: async () => null, COMPASS_DIR: "/nowhere" }));
vi.mock("../adapters", () => ({ destinationOf: (p: string) => ({ path: p, slot: "docs" }) }));

type Row = Record<string, unknown>;

/** Rows by table, and every update the code under test performed. */
const db: Record<string, Row[]> = {};
const updates: { table: string; patch: Row; nullOnly: boolean }[] = [];

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
      upsert: async () => ({ error: null }),
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
  for (const k of Object.keys(db)) delete db[k];
  db.work_task = [{ id: "t1", engagement_id: "eng", title: "Epics", subtitle: "", role_code: "product-manager", workflow_step_id: "s1" }];
  db.workflow_step = [{ id: "s1", produces: "02-scope/deliverables", reads: ["02-scope/business-requirements"] }];
  db.role = [{ org_id: "org", code: "product-manager", agent: null }];
  db.criterion = [];
  db.workflow = [];
  db.document_section = [];
});

describe("a pin that had nothing to pin", () => {
  it("is filled in once the document is supplied", async () => {
    // The task started before the human supplied anything: the input is pinned as an absence.
    db.task_input = [{ task_id: "t1", document_path: "02-scope/business-requirements", document_version: null }];
    // Then the answer arrived and was filed.
    db.document = [{ id: "d1", path: "02-scope/business-requirements", title: "BRD", current_version_id: "v1", engagement_id: "eng" }];
    db.document_version = [{ id: "v1", version: "v1.0", document_id: "d1" }];

    const ctx = await buildContext(actor, "t1");

    const filled = updates.filter((u) => u.table === "task_input");
    expect(filled).toHaveLength(1);
    expect(filled[0].patch).toEqual({ document_version: "v1.0" });
    // Scoped to the empty pins — an `is(document_version, null)` on the update itself.
    expect(filled[0].nullOnly).toBe(true);
    expect(ctx?.inputs[0].version).toBe("v1.0");
  });

  // Provenance is not re-resolved. A pin naming a version is what a finished draft was derived from.
  it("leaves a pin that already names a version alone", async () => {
    db.task_input = [{ task_id: "t1", document_path: "02-scope/business-requirements", document_version: "v1.0" }];
    db.document = [{ id: "d1", path: "02-scope/business-requirements", title: "BRD", current_version_id: "v2", engagement_id: "eng" }];
    db.document_version = [{ id: "v2", version: "v2.0", document_id: "d1" }];

    await buildContext(actor, "t1");
    expect(updates.filter((u) => u.table === "task_input")).toEqual([]);
  });

  // Still absent is still absent — and must stay recorded as an absence rather than becoming an
  // error or a guess at a version.
  it("does nothing when the document still does not exist", async () => {
    db.task_input = [{ task_id: "t1", document_path: "02-scope/business-requirements", document_version: null }];
    db.document = [];
    db.document_version = [];

    const ctx = await buildContext(actor, "t1");
    expect(updates.filter((u) => u.table === "task_input")).toEqual([]);
    expect(ctx?.inputs[0].version).toBeNull();
    expect(ctx?.inputs[0].body).toBeNull();
  });

  // A document row that exists with no filed version is the scaffolded-but-undrafted case, and it
  // is not something to pin.
  it("does nothing when the document exists but has no version", async () => {
    db.task_input = [{ task_id: "t1", document_path: "02-scope/business-requirements", document_version: null }];
    db.document = [{ id: "d1", path: "02-scope/business-requirements", title: "BRD", current_version_id: null, engagement_id: "eng" }];
    db.document_version = [];

    await buildContext(actor, "t1");
    expect(updates.filter((u) => u.table === "task_input")).toEqual([]);
  });
});
