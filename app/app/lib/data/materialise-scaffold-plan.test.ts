import { describe, expect, it, beforeEach, vi } from "vitest";

// The write path of the scaffold-plan materializer: approval of the accepted record creates the repo
// rows and fans out the repos' tasks. Driven through `materialiseFrom`, the way approval drives it,
// with a fake database that applies inserts and updates for real.

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ emit: async () => {} }));
vi.mock("./actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./actor")>();
  return { ...actual, holdersOn: async () => [] };
});
vi.mock("./run-subject", () => ({ subjectOfRun: async () => null }));
const fanOutInline = vi.fn(async () => ({ ok: true as const, runs: [] }));
vi.mock("./phases", () => ({ fanOutInline }));

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { work_task: [], workflow_step: [], document: [], document_section: [], repo: [] };
let sections: { heading: string; body: string }[] = [];

function chainFor(table: string) {
  let rows: Row[] = db[table] ?? [];
  let mode: "select" | "insert" | "update" = "select";
  let payload: Row = {};
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.order = () => chain;
  chain.contains = (col: string, vals: unknown[]) => {
    rows = rows.filter((r) => Array.isArray(r[col]) && (r[col] as unknown[]).includes(vals[0]));
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    if (mode === "update") { for (const r of rows.filter((x) => x[col] === val)) Object.assign(r, payload); return chain; }
    rows = rows.filter((r) => r[col] === val);
    return chain;
  };
  chain.insert = (v: Row) => {
    mode = "insert";
    db[table].push({ ...v });
    rows = [v];
    return chain;
  };
  chain.update = (v: Row) => { mode = "update"; payload = v; return chain; };
  chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
  chain.then = (resolve: (r: unknown) => unknown) => {
    if (table === "document_section") return resolve({ data: sections, error: null });
    return resolve({ data: rows, error: null });
  };
  return chain;
}
vi.mock("../supabase", () => ({ supabaseAdmin: () => ({ from: (t: string) => chainFor(t) }) }));

const { materialiseFrom } = await import("./materialise");

const ACTOR = { orgId: "org-1", engagementId: "e1", roleCode: "product-manager", holder: "Nishi" } as never;
const RECORD = (rows: string[]) => [
  { heading: "Scope", body: "The app and its API." },
  { heading: "Repositories", body: ["| key | name | framework |", "|---|---|---|", ...rows].join("\n") },
];

function seed(opts: { nesting?: boolean; existingRepos?: Row[] } = {}) {
  for (const k of Object.keys(db)) db[k] = [];
  db.repo = (opts.existingRepos ?? []).map((r) => ({ id: `r-${r.key}`, engagement_id: "e1", ...r }));
  const steps = {
    draft: { task: "draft", produces: "scaffold-record", output: "scaffold-plan", renders: "doc", depends_on: [] },
    review: { task: "review", produces: null, output: null, renders: "doc-review", depends_on: ["draft"] },
    accept: { task: "accept", produces: null, output: null, renders: "doc-review", depends_on: ["review"] },
  };
  db.workflow_step = [
    { id: "s-draft", workflow_version_id: "v1", ...steps.draft },
    { id: "s-review", workflow_version_id: "v1", ...steps.review },
    { id: "s-accept", workflow_version_id: "v1", ...steps.accept },
    { id: "s-nest", workflow_version_id: "v-run", task: "scaffold-repos", nests_workflow_code: opts.nesting === false ? null : "scaffold-repo" },
  ];
  db.work_task = [
    { id: "t-accept", engagement_id: "e1", workflow_run_id: "run-1", workflow_step_id: "s-accept" },
    { id: "t-nest", engagement_id: "e1", workflow_run_id: "run-1", workflow_step_id: "s-nest" },
  ];
  db.document = [{ engagement_id: "e1", path: "scaffold-record", current_version_id: "dv1" }];
}

/** The fake keys steps by id; `maybeSingle` on work_task returns the accepting task. */
beforeEach(() => {
  fanOutInline.mockClear();
  sections = RECORD(["| app | Web app | nextjs-ts |", "| api | API | nextjs-ts |"]);
  seed();
});

// The nesting row's sibling lookup reads workflow_step through the embed; expose it on each task.
function withEmbeds() {
  for (const t of db.work_task) {
    const step = db.workflow_step.find((s) => s.id === t.workflow_step_id);
    t.workflow_step = step ? { nests_workflow_code: step.nests_workflow_code ?? null } : null;
  }
}

describe("approving an accepted scaffold record", () => {
  it("creates one repo row per listed repo, with no checkout set, and fans the tasks out", async () => {
    seed();
    withEmbeds();
    const r = await materialiseFrom(ACTOR, "t-accept");
    expect(r?.problems).toEqual([]);
    expect(r?.created).toBe(2);
    expect(db.repo.map((x) => x.key)).toEqual(["app", "api"]);
    expect(db.repo.every((x) => x.local_path === undefined || x.local_path === null)).toBe(true);
    expect(fanOutInline).toHaveBeenCalledTimes(1);
    const [, nestingId, subjects] = fanOutInline.mock.calls[0] as unknown as [unknown, string, { ref: string }[]];
    expect(nestingId).toBe("t-nest");
    expect(subjects.map((s) => s.ref)).toEqual(["app", "api"]);
  });

  it("updates an existing repo's name rather than creating a second row for the same key", async () => {
    seed({ existingRepos: [{ key: "app", name: "Old name", local_path: "/checkouts/app" }] });
    withEmbeds();
    sections = RECORD(["| app | New name | nextjs-ts |"]);
    const r = await materialiseFrom(ACTOR, "t-accept");
    expect(r?.problems).toEqual([]);
    expect(r?.updated).toBe(1);
    expect(db.repo.filter((x) => x.key === "app")).toHaveLength(1);
    expect(db.repo[0]).toMatchObject({ name: "New name", local_path: "/checkouts/app" });
  });

  it("creates nothing when the record does not parse, and says why", async () => {
    seed();
    withEmbeds();
    sections = RECORD(["| app | Web app | rails |"]);
    const r = await materialiseFrom(ACTOR, "t-accept");
    expect(r?.problems.join(" ")).toMatch(/framework 'rails'/);
    expect(db.repo).toEqual([]);
    expect(fanOutInline).not.toHaveBeenCalled();
  });

  it("creates nothing and refuses when the run has no scaffold-repo row to fan out from", async () => {
    seed({ nesting: false });
    withEmbeds();
    const r = await materialiseFrom(ACTOR, "t-accept");
    expect(r?.problems.join(" ")).toMatch(/no row that nests the scaffold-repo workflow/);
    expect(db.repo).toEqual([]);
    expect(fanOutInline).not.toHaveBeenCalled();
  });

  it("reports a failed fan-out, rather than reporting the approval clean", async () => {
    seed();
    withEmbeds();
    fanOutInline.mockResolvedValueOnce({ ok: false, error: "nested workflow has no steps" } as never);
    const r = await materialiseFrom(ACTOR, "t-accept");
    expect(r?.problems).toContain("nested workflow has no steps");
    expect(db.repo).toHaveLength(2);
  });
});
