import { describe, expect, it, beforeEach, vi } from "vitest";

// `materialiseFrom` decides WHICH close triggers materialising a document into state — this is
// about that routing, not about parsing a roster correctly (that's `materialiseRoster`'s own
// concern). The bug this fixes: `propose-resource-plan`'s own close used to write `member` rows
// the moment the DELIVERY MANAGER finished editing, before `approve-resource-plan` — the actual
// independent reviewer — had looked at any of it. `output` still lives on the drafting row (it is
// also what gets the model the structured `roster` tool instead of free-form `draft`); what
// changed is which row's CLOSE is the trigger.

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ emit: async (e: unknown) => { emitted.push(e as Emitted); } }));
vi.mock("./actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./actor")>();
  return { ...actual, holdersOn: async () => [] };
});
vi.mock("./roster-rows", () => ({
  parseRoster: () => [{ roleLabel: "Product Owner", holder: "Om" }],
}));
vi.mock("./sprint-rows", () => ({ parseCommitments: () => ({ commitments: [], problems: [] }) }));
vi.mock("./backlog", () => ({ backlogOf: async () => [] }));
vi.mock("./tracker", () => ({ mirrorBacklog: async () => ({ placed: [], problems: [] }), mirrorSprint: async () => ({ placed: [], problems: [] }) }));
vi.mock("../agent/context", () => ({ subjectOfRun: async () => null }));

type Emitted = { verb: string; payload: Record<string, unknown> };
const emitted: Emitted[] = [];

/** Every step in the fake workflow version, by task slug. */
let steps: Record<string, {
  task: string; produces: string | null; output: string | null; renders: string | null;
  depends_on: string[]; workflow_version_id: string;
}> = {};
/** Which step id (by task slug) `taskId` resolves to. */
let taskStep: string = "propose";
const WORKFLOW_VERSION = "v1";

let documentVersion: { current_version_id: string } | null = { current_version_id: "dv1" };
let sections: { heading: string; body: string }[] = [{ heading: "Roster", body: "| Role | Holder |\n|---|---|\n| Product Owner | Om |" }];
/** role catalogue, for `materialiseRoster`'s own direct read. */
const roles = [{ code: "product-owner", label: "Product Owner", title: "Product Owner" }];
const writes: { table: string; row: Record<string, unknown> }[] = [];

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const chain: Record<string, unknown> & { _eq: [string, unknown][] } = { _eq: [] };
      Object.assign(chain, {
        select: () => chain,
        eq: (col: string, val: unknown) => { chain._eq.push([col, val]); return chain; },
        order: () => chain,
        contains: (col: string, val: string[]) => { chain._eq.push([col, val[0]]); return chain; },
        insert: (row: Record<string, unknown>) => { writes.push({ table, row }); return { error: null }; },
        maybeSingle: async () => {
          const id = chain._eq.find(([c]) => c === "id")?.[1] as string | undefined;
          if (table === "work_task") return { data: { workflow_step_id: taskStep, workflow_run_id: null } };
          if (table === "workflow_step") {
            // Own-step lookup: by id (the fake "step id" IS the task slug, for simplicity).
            if (id) return { data: steps[id] ?? null };
            // producingStep: by workflow_version_id + task.
            const task = chain._eq.find(([c]) => c === "task")?.[1] as string | undefined;
            return { data: task ? steps[task] ?? null : null };
          }
          if (table === "document") return { data: documentVersion };
          return { data: null };
        },
        then: (res: (v: { data: unknown[] }) => unknown) => {
          if (table === "workflow_step") {
            // hasDownstreamReviewer: renders/depends_on filtered by the fake `contains`.
            const dep = chain._eq.find(([c]) => c === "depends_on")?.[1] as string | undefined;
            return res({
              data: Object.values(steps).filter((s) => dep && s.depends_on.includes(dep)),
            });
          }
          if (table === "document_section") return res({ data: sections });
          if (table === "role") return res({ data: roles });
          return res({ data: [] });
        },
      });
      return chain;
    },
  }),
}));

const { materialiseFrom } = await import("./materialise");

const ACTOR = { orgId: "org-1", engagementId: "e1", roleCode: "product-manager", holder: "Nishi" } as never;

beforeEach(() => {
  emitted.length = 0;
  writes.length = 0;
  documentVersion = { current_version_id: "dv1" };
  sections = [{ heading: "Roster", body: "| Role | Holder |\n|---|---|\n| Product Owner | Om |" }];
});

describe("a drafting row with NO downstream reviewer", () => {
  beforeEach(() => {
    steps = {
      propose: { task: "propose", produces: "resource-plan", output: "roster", renders: "doc", depends_on: [], workflow_version_id: WORKFLOW_VERSION },
    };
    taskStep = "propose";
  });

  it("materialises on its own close — unchanged from today", async () => {
    const r = await materialiseFrom(ACTOR, "t-propose");
    expect(r?.created).toBe(1);
    expect(writes.find((w) => w.table === "member")).toBeTruthy();
    expect(emitted[0]).toMatchObject({ verb: "document.materialised" });
  });
});

describe("a drafting row that an independent reviewer depends on", () => {
  beforeEach(() => {
    steps = {
      propose: { task: "propose", produces: "resource-plan", output: "roster", renders: "doc", depends_on: [], workflow_version_id: WORKFLOW_VERSION },
      approve: { task: "approve", produces: null, output: null, renders: "doc-review", depends_on: ["propose"], workflow_version_id: WORKFLOW_VERSION },
    };
  });

  it("does NOT materialise on the draft's own close — the reviewer's close is the trigger now", async () => {
    taskStep = "propose";
    const r = await materialiseFrom(ACTOR, "t-propose");
    expect(r).toBeNull();
    expect(writes).toEqual([]);
    expect(emitted).toEqual([]);
  });

  it("materialises on the REVIEWER's close, inheriting `output`/`produces` from the row it reviews", async () => {
    taskStep = "approve";
    const r = await materialiseFrom(ACTOR, "t-approve");
    expect(r?.created).toBe(1);
    expect(writes.find((w) => w.table === "member")).toBeTruthy();
  });
});
