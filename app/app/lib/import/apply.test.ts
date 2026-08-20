import { describe, it, expect } from "vitest";
import { applyPlan, describeReport, type ConfigStore } from "./apply";
import { planImport, type Bundle, type Existing } from "./plan";

/** A store that records what it was asked to do, in order. The ordering is the thing worth
 *  testing — a role written before its workstream leaves a dangling reference for as long as the
 *  import takes. */
function fakeStore() {
  const calls: string[] = [];
  let version = 0;
  const store: ConfigStore = {
    async orgId(code) { calls.push(`org:${code}`); return "org-1"; },
    async upsertWorkstream(_o, _e, row) { calls.push(`workstream:${row.code}`); },
    async upsertRole(_o, _e, row) { calls.push(`role:${row.code}`); },
    async upsertWorkflow(_o, _e, row) { calls.push(`workflow:${row.code}`); return `wf-${row.code}`; },
    async latestVersion() { return version; },
    async supersedePublished(id) { calls.push(`supersede:${id}`); },
    async createVersion(id, v) { calls.push(`version:${id}:${v}`); version = v; return `ver-${id}-${v}`; },
    async addSteps(vid, steps) { calls.push(`steps:${vid}:${steps.length}`); },
    async addCriteria(vid, cs) { calls.push(`criteria:${vid}:${cs.length}`); },
  };
  return { store, calls, setVersion: (v: number) => { version = v; } };
}

const bundle: Bundle = {
  workstreams: "code,label\nEngineering,Engineering\n",
  roles: "code,label,tier,scope,workstream\nengineer,Engineer,practitioner,mine,Engineering\n",
  workflows: "code,label,workstream\nbuild,Build,Engineering\n",
  steps: "workflow,ord,kind,role,task\nbuild,1,agent,engineer,implement\nbuild,2,agent,engineer,test\n",
  criteria: "workflow,ord,kind,text\nbuild,1,done,tests pass\n",
};

const empty: Existing = { workstreams: [], roles: [], agents: [], phases: [], documents: [], workflows: [] };
const scope = { orgCode: "acme", engagementId: null };

const planOf = (b: Bundle, e: Existing) => {
  const r = planImport(b, e);
  if (!r.ok) throw new Error("plan failed: " + r.problems.map((p) => p.message).join("; "));
  return r.plan;
};

describe("applyPlan", () => {
  it("writes references before the things that reference them", async () => {
    const { store, calls } = fakeStore();
    await applyPlan(planOf(bundle, empty), scope, store);

    expect(calls[0]).toBe("org:acme");
    expect(calls.indexOf("workstream:Engineering")).toBeLessThan(calls.indexOf("role:engineer"));
    expect(calls.indexOf("role:engineer")).toBeLessThan(calls.indexOf("workflow:build"));
  });

  it("creates version 1 with its steps and criteria", async () => {
    const { store, calls } = fakeStore();
    const report = await applyPlan(planOf(bundle, empty), scope, store);

    expect(calls).toContain("version:wf-build:1");
    expect(calls).toContain("steps:ver-wf-build-1:2");
    expect(calls).toContain("criteria:ver-wf-build-1:1");
    expect(report.versionsCreated).toEqual([{ workflow: "build", version: 1, because: ["first version"] }]);
  });

  it("supersedes the previously published version before publishing the next", async () => {
    const { store, calls } = fakeStore();
    await applyPlan(planOf(bundle, empty), scope, store);
    expect(calls.indexOf("supersede:wf-build")).toBeLessThan(calls.indexOf("version:wf-build:1"));
  });
});

describe("re-running", () => {
  const already: Existing = {
    workstreams: ["Engineering"], roles: ["engineer"], agents: [], phases: [], documents: [],
    workflows: [{
      code: "build",
      steps: [
        { workflow: "build", ord: 1, kind: "agent", role: "engineer", task: "implement", produces: "", reads: [], conditional: "", nests: "", title: "", dependsOn: [] },
        { workflow: "build", ord: 2, kind: "agent", role: "engineer", task: "test", produces: "", reads: [], conditional: "", nests: "", title: "", dependsOn: [] },
      ],
      criteria: [{ workflow: "build", stepOrd: 1, kind: "done", text: "tests pass", subjectKind: "", subjectRef: "", operator: "", value: "" }],
    }],
  };

  it("publishes no new version when nothing changed", async () => {
    const { store, calls } = fakeStore();
    const report = await applyPlan(planOf(bundle, already), scope, store);

    expect(report.versionsCreated).toEqual([]);
    expect(report.skipped).toEqual(["build"]);
    expect(calls.some((c) => c.startsWith("version:"))).toBe(false);
  });

  it("still upserts the workflow row, so a label change lands without a version", async () => {
    const { store, calls } = fakeStore();
    await applyPlan(planOf({ ...bundle, workflows: "code,label,workstream\nbuild,Build a story,Engineering\n" }, already), scope, store);
    expect(calls).toContain("workflow:build");
    expect(calls.some((c) => c.startsWith("version:"))).toBe(false);
  });

  it("publishes the next version number when a step is added", async () => {
    const { store, setVersion, calls } = fakeStore();
    setVersion(1);
    const report = await applyPlan(
      planOf({ ...bundle, steps: bundle.steps + "build,3,agent,engineer,document\n" }, already),
      scope, store,
    );
    expect(calls).toContain("version:wf-build:2");
    expect(report.versionsCreated[0].version).toBe(2);
    expect(report.versionsCreated[0].because.join(" ")).toContain("step(s) added");
  });

  it("is idempotent — applying the same plan twice leaves the same state", async () => {
    const { store, calls } = fakeStore();
    const plan = planOf(bundle, already);
    await applyPlan(plan, scope, store);
    const afterFirst = [...calls];
    await applyPlan(plan, scope, store);
    // Second pass repeats the upserts (harmless, keyed by natural key) and publishes nothing new.
    expect(calls.slice(afterFirst.length).some((c) => c.startsWith("version:"))).toBe(false);
  });
});

describe("describeReport", () => {
  it("says what happened in one line", async () => {
    const { store } = fakeStore();
    const report = await applyPlan(planOf(bundle, empty), scope, store);
    const line = describeReport(report);
    expect(line).toContain("1 workstream(s)");
    expect(line).toContain("1 new workflow(s)");
    expect(line).toContain("1 version(s) published");
  });
});
