import { describe, it, expect, vi } from "vitest";

// `planFor` is org-wide, unlike every other workflow query in this app (`workflowsFor` scopes to
// `actor.roleCode`) — these tests are about the two things unique to it:
//
//   1. a workflow is a phase's own ROOT only when nothing else ever nests its code — the same rule
//      `workflows-view.ts` already uses for "never opened directly", just applied per phase rather
//      than per role.
//   2. the phase boundary: a nested workflow is only walked further when its OWN phase matches the
//      phase currently being rendered — `sprint-0` (Discovery) nests `feature` (Build), and that
//      must stop there rather than pulling Build's fan-out work into Discovery's tree.

vi.mock("server-only", () => ({}));
vi.mock("../jira", () => ({
  jiraForEngagement: async () => null,
  searchIssues: async () => null,
}));
vi.mock("./sprint", async () => {
  const real = await vi.importActual<typeof import("./sprint")>("./sprint");
  return { ...real, maxSprintNo: async () => 0 };
});
vi.mock("./events", () => ({ orgIdFor: async () => "org1" }));

type Row = Record<string, unknown>;

/** A minimal, REAL-filtering fake — `.eq`/`.in`/`.is`/`.not` narrow `rows`; `.order` is a no-op
 *  (fixtures are already in the order a test wants back). Good enough for the small fixtures below;
 *  not a general PostgREST client. */
function table(rows: Row[]) {
  let filtered = rows;
  const q = {
    select: () => q,
    order: () => q,
    eq: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      return q;
    },
    in: (col: string, vals: unknown[]) => {
      filtered = filtered.filter((r) => vals.includes(r[col]));
      return q;
    },
    is: (col: string, val: null) => {
      filtered = filtered.filter((r) => (val === null ? r[col] == null : r[col] === val));
      return q;
    },
    // PostgREST's `or("a.eq.x,a.is.null")` — only the two shapes `planFor` uses.
    or: (expr: string) => {
      const clauses = expr.split(",").map((c) => c.split("."));
      filtered = filtered.filter((r) =>
        clauses.some(([col, op, val]) => (op === "is" && val === "null" ? r[col] == null : r[col] === val)));
      return q;
    },
    not: (col: string, _op: string, val: null) => {
      filtered = filtered.filter((r) => (val === null ? r[col] != null : true));
      return q;
    },
    // `fanOutModeOfWorkflow` resolves a published version by `.maybeSingle()` — none of this
    // file's fixtures declare an `inline`-mode workflow, so every call here returns the first (or
    // no) row and the mode falls back to `nest`, exactly as before that function existed.
    maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
    then: (res: (v: { data: Row[]; error: null }) => void) => res({ data: filtered, error: null }),
  };
  return q;
}

const WORKFLOWS: Row[] = [
  { id: "w-onb", code: "onboarding", label: "New Project", phase_code: "New", owner_role_code: "pmo-analyst", repeatable: false, org_id: "org1", enabled: true },
  { id: "w-s0", code: "sprint-0", label: "Discovery", phase_code: "Discovery", owner_role_code: "delivery-manager", repeatable: false, org_id: "org1", enabled: true },
  { id: "w-tl", code: "timeline", label: "Timeline", phase_code: "Discovery", owner_role_code: "delivery-manager", repeatable: true, org_id: "org1", enabled: true },
  { id: "w-feat", code: "feature", label: "Feature", phase_code: "Build", owner_role_code: "product-owner", repeatable: true, org_id: "org1", enabled: true },
  { id: "w-build", code: "build", label: "Workflow: /build", phase_code: "Build", owner_role_code: "engineer", repeatable: true, org_id: "org1", enabled: true },
  // `scaffold-repo` — the live `inline`-fan-out case (`fan-out-kinds.ts`): its own steps'
  // `produces` carries `{repo}`, and it is never a root, only ever reached by a nesting row.
  { id: "w-sr", code: "scaffold-repo", label: "Scaffold one repo", phase_code: "Discovery", owner_role_code: "staff-engineer", repeatable: true, org_id: "org1", enabled: true },
];
const VERSIONS: Row[] = [
  { id: "v-s0", workflow_id: "w-s0" },
  { id: "v-sr", workflow_id: "w-sr", status: "published" },
];
const NESTING_STEPS: Row[] = [
  { workflow_version_id: "v-s0", nests_workflow_code: "timeline" },
  { workflow_version_id: "v-s0", nests_workflow_code: "feature" },
  { workflow_version_id: "v-s0", nests_workflow_code: "scaffold-repo" },
];
/** `scaffold-repo`'s own template steps — what a `scaffold-repos` nesting row materializes once
 *  per repo. Its own `workflow_step` table, kept apart from `NESTING_STEPS`: a real `workflow_step`
 *  row carries both shapes' columns at once, but this file's two existing tables never needed to. */
const SCAFFOLD_REPO_STEPS: Row[] = [
  { id: "s-exec", workflow_version_id: "v-sr", ord: 1, task: "execute-scaffold", title: "Scaffold the repo", role_code: "staff-engineer", produces: "scaffold/{repo}@scm" },
  { id: "s-appr", workflow_version_id: "v-sr", ord: 2, task: "approve-repo-scaffold", title: "Accept the repo scaffold", role_code: "principal-engineer", produces: null },
];
const CATALOG: Row[] = [
  { code: "New", label: "Setup", ord: 10, cycles: false, org_id: "org1", engagement_id: null, enabled: true },
  { code: "Discovery", label: "Discovery", ord: 20, cycles: false, org_id: "org1", engagement_id: null, enabled: true },
  { code: "Build", label: "Build", ord: 30, cycles: true, org_id: "org1", engagement_id: null, enabled: true },
];

function mockSupabase(opts: { runs?: Row[]; tasks?: Row[]; catalog?: Row[] } = {}) {
  // Each test's fixture must win over any earlier test's — `doMock` alone does not do that once
  // `./plan-view` (and its `../supabase` import) has already been resolved once in this file.
  vi.resetModules();
  vi.doMock("../supabase", () => ({
    supabaseAdmin: () => ({
      from: (name: string) => {
        if (name === "workflow") return table(WORKFLOWS);
        if (name === "workflow_version") return table(VERSIONS);
        if (name === "workflow_step") return table([...NESTING_STEPS, ...SCAFFOLD_REPO_STEPS]);
        if (name === "workflow_run") return table(opts.runs ?? []);
        if (name === "work_task") return table(opts.tasks ?? []);
        if (name === "phase") return table(opts.catalog ?? CATALOG);
        return table([]);
      },
    }),
  }));
}

describe("planFor: which workflow is a phase's own root", () => {
  it("is onboarding (New), sprint-0 (Discovery) and build (Build) — never timeline or feature, which sprint-0 nests", async () => {
    mockSupabase({ runs: [] });
    const { planFor } = await import("./plan-view");
    const phases = await planFor("e1");

    const rootsByPhase = Object.fromEntries(phases.map((p) => [p.code, p.roots.map((r) => r.code)]));
    expect(rootsByPhase.New).toEqual(["onboarding"]);
    expect(rootsByPhase.Discovery).toEqual(["sprint-0"]);
    expect(rootsByPhase.Build).toEqual(["build"]);
  });

  it("orders phases New, Discovery, Build", async () => {
    mockSupabase({ runs: [] });
    const { planFor } = await import("./plan-view");
    const phases = await planFor("e1");
    expect(phases.map((p) => p.code)).toEqual(["New", "Discovery", "Build"]);
  });

  it("gives Build a `cycles` array and every other phase none at all", async () => {
    mockSupabase({ runs: [] });
    const { planFor } = await import("./plan-view");
    const phases = await planFor("e1");
    const byCode = Object.fromEntries(phases.map((p) => [p.code, p]));
    expect(byCode.Build.cycles).toEqual([]);
    expect(byCode.New.cycles).toBeUndefined();
    expect(byCode.Discovery.cycles).toBeUndefined();
  });
});

describe("planFor: the phase boundary stops recursion at a cross-phase nested workflow", () => {
  it("recurses into timeline (Discovery, matches) but leaves feature (Build) a leaf", async () => {
    const runs: Row[] = [
      { engagement_id: "e1", id: "run-s0", workflow_id: "w-s0", state: "open", subject_ref: null, opened_at: "2026-01-01", parent_task_id: null },
    ];
    const tasks: Row[] = [
      {
        id: "t-timeline", workflow_run_id: "run-s0", role_code: "delivery-manager", state: "closed", title: "Draft the timeline",
        workflow_step: { ord: 1, nests_workflow_code: "timeline" },
      },
      {
        id: "t-feature", workflow_run_id: "run-s0", role_code: "product-manager", state: "idle", title: "Features and how each is judged",
        workflow_step: { ord: 2, nests_workflow_code: "feature" },
      },
    ];
    mockSupabase({ runs, tasks });
    const { planFor } = await import("./plan-view");
    const phases = await planFor("e1");
    const discovery = phases.find((p) => p.code === "Discovery")!;
    const s0 = discovery.roots[0];
    const [timelineStep, featureStep] = s0.steps;

    // timeline's phase (Discovery) matches sprint-0's own phase — it recurses (into the
    // not-opened-yet placeholder, since no `timeline` run exists in this fixture).
    expect(timelineStep.nestsCode).toBe("timeline");
    expect(timelineStep.nested).toHaveLength(1);
    expect(timelineStep.nested[0].code).toBe("timeline");

    // feature's phase (Build) does NOT match — left a leaf, nothing pulled into Discovery's tree.
    expect(featureStep.nestsCode).toBe("feature");
    expect(featureStep.nested).toEqual([]);
  });
});

describe("planFor: a root run's own phase_tag overrides its workflow's catalog phase", () => {
  it("buckets a tagged `build` run into a NEW lane this org has never catalogued", async () => {
    const runs: Row[] = [
      { engagement_id: "e1", id: "run-build-1", workflow_id: "w-build", state: "closed", subject_ref: "KAN-1", opened_at: "2026-01-01", parent_task_id: null, phase_tag: "Hypercare" },
      { engagement_id: "e1", id: "run-build-2", workflow_id: "w-build", state: "open", subject_ref: "KAN-2", opened_at: "2026-01-02", parent_task_id: null, phase_tag: null },
    ];
    mockSupabase({ runs, tasks: [] });
    const { planFor } = await import("./plan-view");
    const phases = await planFor("e1");

    // The untagged run stays in Build (its workflow's own catalog phase); the tagged one moves to
    // a lane that does not exist in the phase catalog at all — it still renders, as its own code.
    const build = phases.find((p) => p.code === "Build")!;
    expect(build.roots.map((r) => r.runId)).toEqual(["run-build-2"]);

    const hypercare = phases.find((p) => p.code === "Hypercare")!;
    expect(hypercare).toBeDefined();
    expect(hypercare.label).toBe("Hypercare"); // no catalog row — falls back to the raw code
    expect(hypercare.cycles).toBeUndefined(); // never catalogued, so no cycles flag to read
    expect(hypercare.roots[0].runId).toBe("run-build-1");

    // Sorts after every catalogued phase (New, Discovery, Build), not among them.
    expect(phases.map((p) => p.code)).toEqual(["New", "Discovery", "Build", "Hypercare"]);
  });
});

describe("planFor: a closed run reports its own real state, not \"available to run again\"", () => {
  it("a closed run of a REPEATABLE workflow (timeline) still says closed, not idle/available", async () => {
    // `timeline` is nested, not a root — reached only via sprint-0's `draft-timeline` step, same
    // shape as the cross-phase fixture above.
    const runs: Row[] = [
      { engagement_id: "e1", id: "run-s0", workflow_id: "w-s0", state: "open", subject_ref: null, opened_at: "2026-01-01", parent_task_id: null, phase_tag: null },
      { engagement_id: "e1", id: "run-tl", workflow_id: "w-tl", state: "closed", subject_ref: null, opened_at: "2026-01-01", parent_task_id: "t-nests-timeline", phase_tag: null },
    ];
    const tasks: Row[] = [
      { id: "t-nests-timeline", workflow_run_id: "run-s0", role_code: "delivery-manager", state: "closed", title: "Draft the timeline", workflow_step: { ord: 1, nests_workflow_code: "timeline" } },
      { id: "t-tl-inner", workflow_run_id: "run-tl", role_code: "delivery-manager", state: "closed", title: "Draft the timeline", workflow_step: { ord: 1, nests_workflow_code: null } },
    ];
    mockSupabase({ runs, tasks });
    const { planFor } = await import("./plan-view");
    const phases = await planFor("e1");
    const discovery = phases.find((p) => p.code === "Discovery")!;
    const timelineNode = discovery.roots[0].steps[0].nested[0];

    expect(timelineNode.closedCount).toBe(1);
    expect(timelineNode.totalCount).toBe(1);
    expect(timelineNode.state).toBe("closed"); // NOT "idle"/"available" — timeline is repeatable
  });
});

// The live regression: `client1-osbl`'s `scaffold-repos` row closed, both repos it scaffolded
// (`backend`, `app`) fully closed, and `scaffold-repo` still rendered `idle, 0/0` on the Plan page
// regardless. `scaffold-repo` is `inline` fan-out (`fan-out-kinds.ts`) — its steps are materialized
// as sibling tasks in the SAME run, never a child `workflow_run` — and `runsOfWorkflow`'s normal
// "no runs ⇒ not opened yet" fallback can never see anything else for it. These tests are the
// Plan-page counterpart to `nested-close-retry.test.ts`'s inline-mode cases: same bug family, this
// file's own corner of it.
describe("planFor: an INLINE fan-out nesting row reads its materialized siblings, not a child run", () => {
  const nestingTask = (state: string): Row => ({
    id: "t-sr", workflow_run_id: "run-s0", role_code: "staff-engineer", state,
    title: "Scaffold each repo", workflow_step: { ord: 1, nests_workflow_code: "scaffold-repo" },
  });
  const sibling = (repo: string, stepId: string, title: string, role: string, state: string, id: string): Row => ({
    id, workflow_run_id: "run-s0", workflow_step_id: stepId, subject_ref: repo,
    role_code: role, state, title,
  });
  const runs: Row[] = [
    { engagement_id: "e1", id: "run-s0", workflow_id: "w-s0", state: "open", subject_ref: null, opened_at: "2026-01-01", parent_task_id: null, phase_tag: null },
  ];

  it("reports one node per repo it actually materialized, each closed on its own siblings", async () => {
    const tasks: Row[] = [
      nestingTask("closed"),
      sibling("backend", "s-exec", "Scaffold the repo", "staff-engineer", "closed", "t-b-exec"),
      sibling("backend", "s-appr", "Accept the repo scaffold", "principal-engineer", "closed", "t-b-appr"),
      sibling("app", "s-exec", "Scaffold the repo", "staff-engineer", "closed", "t-a-exec"),
      sibling("app", "s-appr", "Accept the repo scaffold", "principal-engineer", "running", "t-a-appr"),
    ];
    mockSupabase({ runs, tasks });
    const { planFor } = await import("./plan-view");
    const discovery = (await planFor("e1")).find((p) => p.code === "Discovery")!;
    const scaffoldStep = discovery.roots[0].steps.find((s) => s.title === "Scaffold each repo")!;

    expect(scaffoldStep.state).toBe("closed"); // the nesting row's OWN state — unaffected by this fix
    const byRepo = Object.fromEntries(scaffoldStep.nested.map((n) => [n.subject, n]));
    expect(Object.keys(byRepo).sort()).toEqual(["app", "backend"]);

    expect(byRepo.backend).toMatchObject({ label: "Scaffold one repo — backend", state: "closed", closedCount: 2, totalCount: 2, runId: null });
    // `app`'s pair is NOT both closed — this node must say so, not inherit the nesting row's.
    expect(byRepo.app).toMatchObject({ label: "Scaffold one repo — app", state: "open", closedCount: 1, totalCount: 2 });
  });

  // Rule 11's Plan-page shape: no repo materialized yet is not the same as one finished with none.
  it("falls back to the plain not-opened placeholder when nothing has been materialized", async () => {
    mockSupabase({ runs, tasks: [nestingTask("running")] });
    const { planFor } = await import("./plan-view");
    const discovery = (await planFor("e1")).find((p) => p.code === "Discovery")!;
    const scaffoldStep = discovery.roots[0].steps.find((s) => s.title === "Scaffold each repo")!;

    expect(scaffoldStep.nested).toEqual([
      expect.objectContaining({ code: "scaffold-repo", state: "idle", subject: null, closedCount: 0, totalCount: 0 }),
    ]);
  });
});

describe("planFor: scoped to the engagement it is asked about", () => {
  it("does not list another engagement's run of the same workflow", async () => {
    // `build` is defined once for the org, so both engagements' runs share `workflow_id`.
    const runs: Row[] = [
      { engagement_id: "e1", id: "run-mine", workflow_id: "w-build", state: "open", subject_ref: "KAN-1", opened_at: "2026-01-02", parent_task_id: null, phase_tag: null },
      { engagement_id: "e2", id: "run-theirs", workflow_id: "w-build", state: "open", subject_ref: "ZZZ-9", opened_at: "2026-01-03", parent_task_id: null, phase_tag: null },
    ];
    mockSupabase({ runs });
    const { planFor } = await import("./plan-view");

    const mine = (await planFor("e1")).find((p) => p.code === "Build")!;
    expect(mine.roots.map((r) => r.runId)).toEqual(["run-mine"]);

    const theirs = (await planFor("e2")).find((p) => p.code === "Build")!;
    expect(theirs.roots.map((r) => r.runId)).toEqual(["run-theirs"]);
  });

  it("an engagement with no runs of its own sees none of the org's other runs", async () => {
    const runs: Row[] = [
      { engagement_id: "e2", id: "run-theirs", workflow_id: "w-build", state: "open", subject_ref: "ZZZ-9", opened_at: "2026-01-03", parent_task_id: null, phase_tag: null },
    ];
    mockSupabase({ runs });
    const { planFor } = await import("./plan-view");

    const build = (await planFor("e1")).find((p) => p.code === "Build")!;
    // The workflow still appears (it is defined for the org) — as a not-yet-opened placeholder.
    expect(build.roots).toHaveLength(1);
    expect(build.roots[0].runId).toBeNull();
  });
});

describe("planFor: an engagement's own workflow definition wins over the org default", () => {
  it("uses the engagement's row for a code both define, and the org row for the rest", async () => {
    const workflows: Row[] = [
      ...WORKFLOWS,
      { id: "w-build-e1", code: "build", label: "Our build", phase_code: "Build", owner_role_code: "engineer", repeatable: true, org_id: "org1", enabled: true, engagement_id: "e1" },
    ];
    vi.resetModules();
    vi.doMock("../supabase", () => ({
      supabaseAdmin: () => ({
        from: (name: string) => {
          if (name === "workflow") return table(workflows);
          if (name === "workflow_version") return table(VERSIONS);
          if (name === "workflow_step") return table(NESTING_STEPS);
          if (name === "workflow_run") return table([]);
          if (name === "work_task") return table([]);
          if (name === "phase") return table(CATALOG);
          return table([]);
        },
      }),
    }));
    const { planFor } = await import("./plan-view");

    const e1 = await planFor("e1");
    expect(e1.find((p) => p.code === "Build")!.roots[0].label).toBe("Our build");
    expect(e1.find((p) => p.code === "Discovery")!.roots[0].label).toBe("Discovery"); // org default

    // Another engagement does not see e1's override.
    const e2 = await planFor("e2");
    expect(e2.find((p) => p.code === "Build")!.roots[0].label).toBe("Workflow: /build");
  });
});
