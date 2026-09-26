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
    not: (col: string, _op: string, val: null) => {
      filtered = filtered.filter((r) => (val === null ? r[col] != null : true));
      return q;
    },
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
];
const VERSIONS: Row[] = [{ id: "v-s0", workflow_id: "w-s0" }];
const NESTING_STEPS: Row[] = [
  { workflow_version_id: "v-s0", nests_workflow_code: "timeline" },
  { workflow_version_id: "v-s0", nests_workflow_code: "feature" },
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
        if (name === "workflow_step") return table(NESTING_STEPS);
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
      { id: "run-s0", workflow_id: "w-s0", state: "open", subject_ref: null, opened_at: "2026-01-01", parent_task_id: null },
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
      { id: "run-build-1", workflow_id: "w-build", state: "closed", subject_ref: "KAN-1", opened_at: "2026-01-01", parent_task_id: null, phase_tag: "Hypercare" },
      { id: "run-build-2", workflow_id: "w-build", state: "open", subject_ref: "KAN-2", opened_at: "2026-01-02", parent_task_id: null, phase_tag: null },
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
      { id: "run-s0", workflow_id: "w-s0", state: "open", subject_ref: null, opened_at: "2026-01-01", parent_task_id: null, phase_tag: null },
      { id: "run-tl", workflow_id: "w-tl", state: "closed", subject_ref: null, opened_at: "2026-01-01", parent_task_id: "t-nests-timeline", phase_tag: null },
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
