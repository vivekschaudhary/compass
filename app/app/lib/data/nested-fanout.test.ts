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
  versionSteps: Row[]; backlog: Row[]; repos: Row[]; runs: Row[]; criteria: Row[];
} = {
  tasks: [], steps: [], workflows: [], versions: [], versionSteps: [], backlog: [], repos: [],
  runs: [], criteria: [],
};

/** Every open_nested_run call the code under test made, in order. */
const opened: { taskId: string; subject: string | null }[] = [];
/** Every run whose gates were measured on the way out. */
const remeasured: string[] = [];
/** Every task id `startTask` was called with. */
const started: string[] = [];

const rowsFor = (table: string): Row[] =>
  table === "work_task" ? state.tasks
  : table === "workflow_step" ? state.steps
  : table === "workflow" ? state.workflows
  : table === "workflow_version" ? state.versions
  : table === "backlog_item" ? state.backlog
  : table === "repo" ? state.repos
  : table === "workflow_run" ? state.runs
  : table === "criterion" ? state.criteria
  : [];

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      // Filters are applied for real: `epicsOfRun` selects on kind and on a set of task ids, and a
      // fake that ignored `eq`/`in` would return every row and pass a test that the real query fails.
      let rows = rowsFor(table);
      const chain: Record<string, unknown> = {
        select: (cols: string) => {
          // `workflow_step` is read two ways — once for the nesting row (a single lookup by id, the
          // `nests_workflow_code` column alone), once for the nested workflow's whole version (its
          // `produces`, or now its full step shape for inline materialization). Anything beyond the
          // single-column id lookup means "the version's steps".
          if (table === "workflow_step" && cols !== "nests_workflow_code") rows = state.versionSteps;
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
        // Inline materialization writes real rows — `work_task` for the materialized tasks,
        // `criterion` for their copied gates. Pushed onto the SAME array `rowsFor` returned, so a
        // later read in the same test sees what an earlier write added.
        insert: (values: Row | Row[]) => {
          const arr = Array.isArray(values) ? values : [values];
          for (const v of arr) rows.push({ id: `gen-${rows.length}-${Math.random()}`, ...v });
          return { error: null };
        },
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
vi.mock("./gates", () => ({
  measureTask: async () => [],
  remeasureRun: async (_a: unknown, runId: string) => { remeasured.push(runId); },
  storedStatusFor: async () => null,
}));
vi.mock("./tracker", () => ({
  mirrorPhase: async () => ({ epic: null, stories: [], expected: 0, problems: [] }),
  mirrorNested: async () => ({ epic: null, stories: [], expected: 0, problems: [] }),
  mirrorState: async () => ({ ok: true }),
}));
vi.mock("./ticket-body", () => ({ composeTicketBodies: async () => ({ written: [], expected: 0, problems: [] }) }));
vi.mock("./steps", () => ({ sortByStep: <T,>(x: T[]) => x }));
vi.mock("./tasks", () => ({
  startTask: async (_actor: unknown, taskId: string) => { started.push(taskId); return { ok: true }; },
}));

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

/**
 * The `scaffold-repos` row, inside its own `foundation-architecture` run (`run-scaffold`, own
 * version `v-fa` — distinct from the template's `v-sr`, so a test can tell "copied into the
 * PARENT's version" apart from "still only on the template's").
 */
function seedRepoFanOut(opts: { repos: string[] }) {
  state.tasks = [
    { id: "t-nest", org_id: "org-1", engagement_id: "e1", workflow_step_id: "s-nest", workflow_run_id: "run-scaffold" },
  ];
  state.steps = [{ id: "s-nest", nests_workflow_code: "scaffold-repo", kind: "workflow" }];
  state.workflows = [{
    id: "w-sr", org_id: "org-1", code: "scaffold-repo", engagement_id: null,
    owner_role_code: "staff-engineer", workstream_code: "Engineering",
  }];
  state.versions = [{ id: "v-sr", workflow_id: "w-sr", status: "published" }];
  state.versionSteps = [
    {
      id: "step-execute", workflow_version_id: "v-sr", ord: 1, kind: "agent",
      role_code: "staff-engineer", task: "execute-scaffold", title: "Scaffold the repo",
      produces: "scaffold/{repo}@scm",
    },
    {
      id: "step-approve", workflow_version_id: "v-sr", ord: 2, kind: "hitl",
      role_code: "principal-engineer", task: "approve-repo-scaffold", title: "Accept the repo scaffold",
      produces: null,
    },
  ];
  state.repos = opts.repos.map((key, i) => ({ key, engagement_id: "e1", ord: i }));
  state.runs = [{ id: "run-scaffold", workflow_version_id: "v-fa" }];
  state.criteria = [];
}

beforeEach(() => { opened.length = 0; remeasured.length = 0; started.length = 0; });

describe("a nesting row that fans out", () => {
  it("opens one run per epic, each carrying its own subject", async () => {
    seed({ perEpic: true, epics: ["E1", "E2", "E3"] });
    const r = await openNestedFanOut(ACTOR, "t-nest");

    expect(r.ok).toBe(true);
    expect(opened.map((o) => o.subject)).toEqual(["E1", "E2", "E3"]);
    // Distinct runs, not one run reported three times — the whole point of the subject.
    expect(new Set((r as { runs: { runId: string }[] }).runs.map((x) => x.runId)).size).toBe(3);
  });

  // A child run opened with no measurements at all is a run whose first row `start_task` refuses as
  // "Not ready" — even when the document it reads was published hours ago. `initiatePhase` has
  // always measured a phase's rows on the way out; `openNested` did not, which made every nested
  // workflow unstartable until someone pressed re-check on it.
  it("measures the rows of every run it opens", async () => {
    seed({ perEpic: true, epics: ["E1", "E2", "E3"] });
    await openNestedFanOut(ACTOR, "t-nest");
    expect(remeasured).toEqual(opened.map((_, i) => `run-${i + 1}`));
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

// The second real fan-out kind — added to prove `{epic}` was never special-cased anywhere it
// shouldn't have been. `execute-scaffold`'s own `produces` is `scaffold/{repo}@scm`; the repos come
// from the `repo` table (registered once per engagement by `accept-scaffold`), not from a run's own
// backlog the way epics do — the one place this kind's own subject source genuinely differs.
// `repo` is the `inline` fan-out kind — it does NOT open a second run per subject. Jira's hierarchy
// caps at one level below an epic, and `scaffold-repos` already sits one level nested under
// `sprint-0`'s `foundation-architecture`; a second nested run per repo cannot be mirrored. Instead
// the template's steps (`execute-scaffold`, `approve-repo-scaffold`) are cloned as plain tasks
// INSIDE the calling run, one pair per repo — asserted here by what `work_task` ends up holding,
// not by what `open_nested_run` was called with (it never is, for this kind).
describe("a nesting row that fans out over repos (inline)", () => {
  it("materializes one task pair per repo, in the SAME run — no second run opened", async () => {
    seedRepoFanOut({ repos: ["app", "api"] });
    const before = state.tasks.length;
    const r = await openNestedFanOut(ACTOR, "t-nest");

    expect(r.ok).toBe(true);
    expect(opened, "inline mode never calls open_nested_run").toEqual([]);

    const materialized = state.tasks.slice(before);
    expect(materialized).toHaveLength(4); // 2 repos x 2 steps
    expect(materialized.map((t) => t.subject_ref).sort()).toEqual(["api", "api", "app", "app"]);
    expect(materialized.every((t) => t.workflow_run_id === "run-scaffold")).toBe(true);

    const runs = (r as { runs: { runId: string; subject: string | null }[] }).runs;
    expect(runs.map((x) => x.subject)).toEqual(["app", "api"]);
    // Same run for every subject — there is only ever one, now that nothing nests a second time.
    expect(new Set(runs.map((x) => x.runId))).toEqual(new Set(["run-scaffold"]));
  });

  it("copies the template's criteria into the PARENT run's own version", async () => {
    seedRepoFanOut({ repos: ["app"] });
    state.criteria = [
      { workflow_version_id: "v-sr", step_task: "execute-scaffold", kind: "ready", statement: "x", ord: 0 },
    ];
    await openNestedFanOut(ACTOR, "t-nest");

    const copied = state.criteria.filter((c) => c.workflow_version_id === "v-fa");
    expect(copied).toHaveLength(1);
    expect(copied[0].step_task).toBe("execute-scaffold");
  });

  it("is idempotent — a retry does not clone a second pair for the same repo", async () => {
    seedRepoFanOut({ repos: ["app"] });
    await openNestedFanOut(ACTOR, "t-nest");
    const afterFirst = state.tasks.length;
    await openNestedFanOut(ACTOR, "t-nest");

    expect(state.tasks.length, "second call added nothing new").toBe(afterFirst);
  });

  it("auto-starts each subject's first materialized task for the same role", async () => {
    seedRepoFanOut({ repos: ["app", "api"] });
    await openNestedFanOut(ACTOR, "t-nest");

    // `execute-scaffold` is `staff-engineer`, same as ACTOR — both subjects' first task starts.
    expect(started).toHaveLength(2);
  });

  it("refuses when no repos are registered, rather than opening nothing and reporting success", async () => {
    seedRepoFanOut({ repos: [] });
    const before = state.tasks.length;
    const r = await openNestedFanOut(ACTOR, "t-nest");

    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/no repos/i);
    expect(opened, "nothing should have been opened").toEqual([]);
    expect(state.tasks.length, "nothing materialized either").toBe(before);
  });
});

describe("opening a child run's first task", () => {
  // Whoever clicked "Open the X run" is already looking at it — starting it too is the same
  // promise a plain task's own click already makes. But `start_task` carries no role check of its
  // own, so this must not fire on someone else's row just because nothing stops it.
  it("auto-starts when the child run's first task belongs to the SAME role that opened it", async () => {
    seed({ perEpic: false, epics: [] });
    state.tasks.push({ id: "t-child", workflow_run_id: "run-1", role_code: ACTOR.roleCode });

    const r = await openNestedFanOut(ACTOR, "t-nest");

    expect(r.ok).toBe(true);
    expect(started).toEqual(["t-child"]);
  });

  it("leaves it idle when the child run's first task belongs to a DIFFERENT role", async () => {
    seed({ perEpic: false, epics: [] });
    state.tasks.push({ id: "t-child", workflow_run_id: "run-1", role_code: "product-manager" });

    const r = await openNestedFanOut(ACTOR, "t-nest");

    expect(r.ok).toBe(true);
    expect(started).toEqual([]);
  });
});
