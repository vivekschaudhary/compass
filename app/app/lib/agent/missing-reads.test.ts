import { describe, it, expect, vi, beforeEach } from "vitest";

// A build is handed to a process that reads the step's documents at the versions pinned for the task
// and halts on one that is missing. `missingReads` is how the app finds that out first, while nothing
// has been spawned: it settles the pins, then reports every declared input with no document behind it.

vi.mock("server-only", () => ({}));
vi.mock("../specs", () => ({ resolveSpec: async () => null, resolveSpecFromTable: async () => null, COMPASS_DIR: "/nowhere" }));
vi.mock("../data/run-subject", () => ({ subjectOfRun: async () => ({ ref: "S1", key: "CT-359", epicKey: "CT-288" }) }));

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

function client() {
  const query = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const rows = () => (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const api = {
      select: () => api,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return api; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return api; },
      order: () => api,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      update: (patch: Row) => {
        const u = {
          eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return u; },
          is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return u; },
          then: (res: (v: unknown) => unknown) => {
            for (const r of rows()) Object.assign(r, patch);
            return Promise.resolve({ error: null }).then(res);
          },
        };
        return u;
      },
      upsert: async (batch: Row[]) => {
        (db[table] ??= []).push(...batch);
        return { error: null };
      },
      then: (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null, count: rows().length }).then(res),
    };
    return api;
  };
  return { from: query };
}

vi.mock("../supabase", () => ({ supabaseAdmin: () => client(), must: (_l: string, r: { data: unknown }) => r.data }));

const { missingReads } = await import("./context/loaders");

const doc = (path: string, versionId: string | null) => ({ id: `d-${path}`, engagement_id: "eng", path, current_version_id: versionId });

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  db.document_version = [{ id: "v1", version: "1.0" }];
});

describe("missingReads", () => {
  it("reports every pinned input that has no version, and none that has", async () => {
    db.task_input = [
      { task_id: "t1", document_path: "epic/CT-288", document_version: "1.0" },
      { task_id: "t1", document_path: "design-library", document_version: null },
      { task_id: "t1", document_path: "scaffold-record", document_version: null },
    ];
    expect(await missingReads("t1", "eng")).toEqual(["design-library", "scaffold-record"]);
  });

  it("is empty when everything is pinned", async () => {
    db.task_input = [{ task_id: "t1", document_path: "epic/CT-288", document_version: "1.0" }];
    expect(await missingReads("t1", "eng")).toEqual([]);
  });

  it("does not call an input missing once the document has since been filed", async () => {
    db.task_input = [{ task_id: "t1", document_path: "design-library", document_version: null }];
    db.document = [doc("design-library", "v1")];
    expect(await missingReads("t1", "eng")).toEqual([]);
    expect(db.task_input[0].document_version, "the absence is resolved forward, as the agent's own load does").toBe("1.0");
  });

  it("pins a task nobody has pinned, resolving the story's tokens, and reports what is not there", async () => {
    db.work_task = [{ id: "t1", workflow_step_id: "s1", workflow_run_id: "r1", subject_ref: "S1" }];
    db.workflow_step = [{ id: "s1", reads: ["stories/{epic}", "epic/{epic}", "design-library"] }];
    db.document = [doc("stories/CT-288", "v1"), doc("epic/CT-288", "v1")];
    expect(await missingReads("t1", "eng")).toEqual(["design-library"]);
    expect(db.task_input.map((r) => r.document_path).sort()).toEqual(["design-library", "epic/CT-288", "stories/CT-288"]);
  });

  it("a task whose step declares nothing has nothing missing", async () => {
    db.work_task = [{ id: "t1", workflow_step_id: "s1", workflow_run_id: "r1", subject_ref: "S1" }];
    db.workflow_step = [{ id: "s1", reads: [] }];
    expect(await missingReads("t1", "eng")).toEqual([]);
  });
});
