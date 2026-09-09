import { describe, expect, it, vi, beforeEach } from "vitest";

// One nesting row, many child runs.
//
// Every nesting row in the seed opened exactly one child, because `open_nested_run` is idempotent
// on `parent_task_id` alone. Epic technical design is the first that must not be: a design is
// authored per epic, as its own page, reviewed and approved on its own.
//
// The failure this guards is the quiet one. Fanning out over zero epics completes — `for (const e
// of [])` does nothing and reports success — so a technical design phase that designed nothing
// would look exactly like one that designed everything, and the row would close green. That is the
// aggregate-over-no-rows trap, and it is asserted here rather than assumed.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const state: {
  tasks: Row[]; steps: Row[]; workflows: Row[]; versions: Row[];
  versionSteps: Row[]; backlog: Row[];
} = { tasks: [], steps: [], workflows: [], versions: [], versionSteps: [], backlog: [] };

/** Every open_nested_run call the code under test made, in order. */
const opened: { taskId: string; subject: string | null }[] = [];

const rowsFor = (table: string): Row[] =>
  table === "work_task" ? state.tasks
  : table === "workflow_step" ? state.steps
  : table === "workflow" ? state.workflows
  : table === "workflow_version" ? state.versions
  : table === "backlog_item" ? state.backlog
  : [];

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      // Filters are applied for real: `epicsOfRun` selects on kind and on a set of task ids, and a
      // fake that ignored `eq`/`in` would return every row and pass a test that the real query fails.
      let rows = rowsFor(table);
      const chain: Record<string, unknown> = {
        select: (cols: string) => {
          // `workflow_step` is read two ways — once for the nesting row, once for the nested
          // workflow's version. The column list is what tells them apart.
          if (table === "workflow_step" && cols.includes("produces")) rows = state.versionSteps;
          return chain;
        },
        eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return chain; },
        in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return chain; },
        or: () => chain,
        is: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        then: (res: (v: { data: Row[] }) => unknown) => res({ data: rows }),
      };
      return chain;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== "open_nested_run") return { data: null, error: null };
      opened.push({
        taskId: args.p_task_id as string,
        subject: (args.p_subject_ref as string | null) ?? null,
      });
      return { data: `run-${opened.length}`, error: null };
    },
  }),
}));

vi.mock("./events", () => ({ orgIdFor: async () => "org-1", emit: async () => {}, emitRefusal: async () => {} }));
vi.mock("./gates", () => ({ measureTask: async () => [], storedStatusFor: async () => null }));
vi.mock("./tracker", () => ({
  mirrorPhase: async () => ({ epic: null, stories: [], expected: 0, problems: [] }),
  mirrorNested: async () => ({ epic: null, stories: [], expected: 0, problems: [] }),
  mirrorState: async () => ({ ok: true }),
}));
vi.mock("./ticket-body", () => ({ composeTicketBodies: async () => ({ written: [], expected: 0, problems: [] }) }));
vi.mock("./steps", () => ({ sortByStep: <T,>(x: T[]) => x }));

const { openNestedFanOut } = await import("./phases");

const ACTOR = {
  orgId: "org-1", engagementId: "e1", roleCode: "staff-engineer", roleLabel: "Architect",
  holder: "Ada", scope: "everyone" as const, workstreamCode: null, agent: null,
  tier: "practitioner", capabilities: [],
};

/** The `epics.design-epics-tech` row, its run, and the workflow it nests. */
function seed(opts: { perEpic: boolean; epics: string[] }) {
  state.tasks = [
    { id: "t-nest", org_id: "org-1", engagement_id: "e1", workflow_step_id: "s-nest", workflow_run_id: "run-epics" },
    { id: "t-draft", org_id: "org-1", engagement_id: "e1", workflow_step_id: "s-draft", workflow_run_id: "run-epics" },
  ];
  state.steps = [{ id: "s-nest", nests_workflow_code: "tech-design", kind: "workflow" }];
  state.workflows = [{ id: "w-td", org_id: "org-1", code: "tech-design", engagement_id: null }];
  state.versions = [{ id: "v-td", workflow_id: "w-td", status: "published" }];
  state.versionSteps = opts.perEpic
    ? [{ workflow_version_id: "v-td", produces: "03-architecture/epic/{epic}" },
       { workflow_version_id: "v-td", produces: "03-architecture/epic/{epic}-review" }]
    : [{ workflow_version_id: "v-td", produces: "features" }];
  state.backlog = opts.epics.map((ref, i) => ({
    ref, ticket_key: null, kind: "epic", task_id: "t-draft", ord: i,
  }));
}

beforeEach(() => { opened.length = 0; });

describe("a nesting row that fans out", () => {
  it("opens one run per epic, each carrying its own subject", async () => {
    seed({ perEpic: true, epics: ["E1", "E2", "E3"] });
    const r = await openNestedFanOut(ACTOR, "t-nest");

    expect(r.ok).toBe(true);
    expect(opened.map((o) => o.subject)).toEqual(["E1", "E2", "E3"]);
    // Distinct runs, not one run reported three times — the whole point of the subject.
    expect(new Set((r as { runs: { runId: string }[] }).runs.map((x) => x.runId)).size).toBe(3);
  });

  // THE ZERO-ROW CASE. Not an empty success.
  it("refuses when there are no epics, rather than opening nothing and reporting success", async () => {
    seed({ perEpic: true, epics: [] });
    const r = await openNestedFanOut(ACTOR, "t-nest");

    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/no epics/i);
    expect(opened, "nothing should have been opened").toEqual([]);
  });

  // The behaviour every existing nesting row depends on, asserted so the fan-out cannot capture them.
  it("opens exactly one subject-less run for a workflow that is not per-epic", async () => {
    seed({ perEpic: false, epics: ["E1", "E2"] });
    const r = await openNestedFanOut(ACTOR, "t-nest");

    expect(r.ok).toBe(true);
    expect(opened).toEqual([{ taskId: "t-nest", subject: null }]);
  });

  // A design is opened per epic, never per story — the tier below is `build`'s.
  it("ignores backlog rows that are not epics", async () => {
    seed({ perEpic: true, epics: ["E1"] });
    state.backlog.push({ ref: "E1-S1", ticket_key: null, kind: "story", task_id: "t-draft", ord: 1 });
    const r = await openNestedFanOut(ACTOR, "t-nest");

    expect(r.ok).toBe(true);
    expect(opened.map((o) => o.subject)).toEqual(["E1"]);
  });
});
