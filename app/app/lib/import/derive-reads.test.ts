import { describe, it, expect } from "vitest";
import { planImport, deriveReads, type StepRow } from "./plan";

// Depending on a row MEANS consuming what it produces. These tests are about the one fact that
// used to be stated twice and drifted: sprint-0 had eight rows reading a document whose producer
// was not upstream of them, so the foundation architecture could start with no product brief.

const step = (over: Partial<StepRow>): StepRow => ({
  workflow: "sprint-0", ord: 1, kind: "agent", role: "delivery-manager", task: "t",
  produces: "", reads: [], conditional: "", nests: "", title: "", dependsOn: [],
  ...over,
});

describe("deriveReads", () => {
  it("gives a step what its dependencies produce", () => {
    const out = deriveReads([
      step({ ord: 1, task: "file-sow", produces: "02-scope/sow" }),
      step({ ord: 2, task: "draft-brief", produces: "01-foundation/brief", dependsOn: ["file-sow"] }),
    ]);
    expect(out[1].reads).toEqual(["02-scope/sow"]);
  });

  it("takes DIRECT dependencies only, not the whole ancestry", () => {
    // The transitive closure would hand kickoff every document the phase ever produced. A row that
    // needs two things declares two dependencies.
    const out = deriveReads([
      step({ ord: 1, task: "a", produces: "doc/a" }),
      step({ ord: 2, task: "b", produces: "doc/b", dependsOn: ["a"] }),
      step({ ord: 3, task: "c", produces: "doc/c", dependsOn: ["b"] }),
    ]);
    expect(out[2].reads).toEqual(["doc/b"]);
  });

  it("keeps a read that no step in the workflow produces", () => {
    // `sprint` reads the delivery plan from `sprint-0`. No dependency inside `sprint` could supply
    // it, so the authored column is the only place it can come from.
    const out = deriveReads([
      step({ workflow: "sprint", ord: 1, task: "planning", reads: ["03-delivery/plan"] }),
    ]);
    expect(out[0].reads).toEqual(["03-delivery/plan"]);
  });

  it("does not let one workflow's producer satisfy another's dependency", () => {
    const out = deriveReads([
      step({ workflow: "sprint-0", ord: 1, task: "shared", produces: "doc/x" }),
      step({ workflow: "sprint", ord: 1, task: "user", dependsOn: ["shared"] }),
    ]);
    expect(out[1].reads).toEqual([]);
  });

  it("does not duplicate a path reachable both ways", () => {
    const out = deriveReads([
      step({ ord: 1, task: "a", produces: "doc/a" }),
      step({ ord: 2, task: "b", dependsOn: ["a"], reads: ["doc/a"] }),
    ]);
    expect(out[1].reads).toEqual(["doc/a"]);
  });
});

/* ── what the planner refuses ──────────────────────────────────────────────── */

const BUNDLE = (stepsCsv: string) => ({
  workstreams: "code,label,ord,enabled\nDelivery,Delivery,1,true\n",
  roles: "code,label,tier,scope,workstream,agent\ndelivery-manager,DM,practitioner,mine,Delivery,delivery-manager\n",
  workflows: "code,label,workstream,phase,owner_role,trigger,enabled\nsprint-0,Sprint 0,Delivery,Sprint 0,delivery-manager,,true\n",
  steps: "workflow,ord,kind,role,task,produces,reads,conditional,nests,title,depends_on\n" + stepsCsv,
  criteria: "workflow,task,kind,text,subject_kind,subject_ref,operator,value\n",
});

const EXISTING = {
  workstreams: [], roles: [], agents: ["delivery-manager"], phases: [],
  documents: [], workflows: [],
};

const problems = (stepsCsv: string) => {
  const r = planImport(BUNDLE(stepsCsv), EXISTING);
  return r.ok ? [] : r.problems.map((p) => p.message);
};

describe("the dependency graph is checked before the database sees it", () => {
  it("refuses a dependency naming a row that does not exist", () => {
    // The dangerous one. `start_task` joins on dependencies, so a slug matching no row yields no
    // rows, nothing is reported waiting, and the gate OPENS. It reads as satisfied.
    const out = problems(
      "sprint-0,1,agent,delivery-manager,a,doc/a,,,,A,\n" +
      "sprint-0,2,agent,delivery-manager,b,doc/b,,,,B,ghost\n",
    );
    expect(out.some((m) => /depends on 'ghost', which is not a row/.test(m))).toBe(true);
  });

  it("refuses a dependency that points forward", () => {
    const out = problems(
      "sprint-0,1,agent,delivery-manager,a,doc/a,,,,A,b\n" +
      "sprint-0,2,agent,delivery-manager,b,doc/b,,,,B,\n",
    );
    expect(out.some((m) => /depends on 'b' at ord 2, which is not above it/.test(m))).toBe(true);
  });

  it("refuses a read of something the same workflow produces", () => {
    // Stating it in both columns is exactly how they drifted. The fix names the edge to write.
    const out = problems(
      "sprint-0,1,agent,delivery-manager,a,doc/a,,,,A,\n" +
      "sprint-0,2,agent,delivery-manager,b,doc/b,doc/a,,,B,a\n",
    );
    expect(out.some((m) => /reads 'doc\/a', which 'a' produces in the same workflow/.test(m))).toBe(true);
  });

  it("accepts a graph that states each fact once", () => {
    const r = planImport(
      BUNDLE(
        "sprint-0,1,agent,delivery-manager,a,doc/a,,,,A,\n" +
        "sprint-0,2,agent,delivery-manager,b,doc/b,,,,B,a\n",
      ),
      EXISTING,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.workflows[0].steps[1].reads).toEqual(["doc/a"]);
  });
});

describe("the sprint plan's inputs", () => {
  // The two sprint-planning rows are deliberately the same step written twice, and "same inputs" is
  // half of what that means. sprint-0's row gets all three from its dependencies; `sprint`'s row
  // has to author them, because no step inside `sprint` produces any of them.
  it("gives sprint-0's sprint plan the epics, the roster AND the delivery plan", () => {
    const out = deriveReads([
      step({ ord: 5, task: "propose-staffing", produces: "01-foundation/team" }),
      step({ ord: 7, task: "draft-epics", produces: "02-scope/deliverables@tickets" }),
      step({ ord: 8, task: "tailor-delivery-plan", produces: "03-delivery/plan" }),
      step({
        ord: 11, task: "draft-sprint-plan", produces: "05-cadence/sprint-plans",
        dependsOn: ["draft-epics", "propose-staffing", "tailor-delivery-plan"],
      }),
    ]);
    // `@tickets` is routing and belongs to the producer alone — copied into a dependent's `reads`
    // it becomes a path no document ever has.
    expect(out[3].reads).toEqual([
      "02-scope/deliverables", "01-foundation/team", "03-delivery/plan",
    ]);
  });

  it("keeps the same three on the `sprint` row, which has no dependencies to derive from", () => {
    const out = deriveReads([
      step({
        workflow: "sprint", ord: 1, task: "sprint-planning", produces: "05-cadence/sprint-plans",
        reads: ["03-delivery/plan", "02-scope/deliverables", "01-foundation/team"],
      }),
    ]);
    expect(new Set(out[0].reads)).toEqual(
      new Set(["03-delivery/plan", "02-scope/deliverables", "01-foundation/team"]),
    );
  });
});
