import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";
import { planImport, type Bundle, type Existing } from "./plan";

// The real seed lives in the framework, beside the workflows it configures.
const SEED = resolve(process.cwd(), "..", "compass", "seed");
const AGENTS = resolve(process.cwd(), "..", "compass", "agents");

const read = (name: string) => {
  const p = resolve(SEED, name);
  return existsSync(p) ? readFileSync(p, "utf-8") : "";
};

const seedBundle = (): Bundle => ({
  workstreams: read("workstreams.csv"),
  roles: read("roles.csv"),
  workflows: read("workflows.csv"),
  steps: read("workflow-steps.csv"),
  criteria: read("criteria.csv"),
});

const realAgents = () =>
  existsSync(AGENTS) ? readdirSync(AGENTS).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)) : [];

const empty: Existing = { workstreams: [], roles: [], agents: [], phases: [], documents: [], workflows: [] };

/* ── the seed itself must be valid, or the first load fails ──────────────── */


/**
 * The delivery phases the seed ships. Onboarding → sprint 0 → sprint.
 *
 * `pre-sprint-0` was one of these. Its rows — the SOW, the timeline, staffing, the RACI, the epics,
 * the tailored plan — are now sprint-0 steps 1-8, and the phase is gone from the seed rather than
 * parked, so asserting on it here would be asserting on a workflow no import produces.
 */
const PHASES = ["onboarding", "sprint-0", "sprint"] as const;

describe("the shipped seed", () => {
  const planned = () => {
    const result = planImport(seedBundle(), { ...empty, agents: realAgents() });
    if (!result.ok) {
      throw new Error("seed does not validate:\n" + result.problems.map((p) => `  ${p.file}:${p.row} ${p.message}`).join("\n"));
    }
    return result.plan;
  };

  it("plans cleanly against an empty database, and everything in it is new", () => {
    const plan = planned();
    expect(plan.workflows.length).toBeGreaterThan(0);
    expect(plan.workflows.every((w) => w.action === "create")).toBe(true);
  });

  it("names an agent file that actually exists", () => {
    const agents = realAgents();
    expect(agents.length).toBeGreaterThan(0);           // guard: the check is only meaningful if we found the dir
    expect(planImport(seedBundle(), { ...empty, agents }).ok).toBe(true);
  });

  // The invariant, not the count — the seed will grow, and a hardcoded length would just have to
  // be edited each time without ever catching anything.
  it("has no workflow that starts itself — a person initiates", () => {
    // This used to assert exactly one `project-created` trigger (plan-kickoff), which encoded the
    // old design: creating a project silently opened work. A phase is initiated by the delivery
    // manager instead, because an engagement existing is not the same as an engagement being ready
    // to start — the admin may create it days before anyone is available to run it.
    const selfStarting = planned().workflows.filter((w) => w.row.trigger);
    expect(selfStarting.map((w) => w.row.code)).toEqual([]);
  });

  // The two sprint-planning rows are deliberately the same step written twice — sprint 0 has to
  // end with sprint 1 planned, and every sprint after plans itself. Asserted against the REAL seed
  // rather than a fixture, because the thing that can break is the CSV, not `deriveReads`.
  it("gives both sprint-planning rows the same three inputs", () => {
    const stepsOf = (code: string) =>
      planned().workflows.find((w) => w.row.code === code)?.steps ?? [];
    const s0 = stepsOf("sprint-0").find((x) => x.task === "draft-sprint-plan");
    const sn = stepsOf("sprint").find((x) => x.task === "sprint-planning");

    expect(s0, "sprint-0 has no draft-sprint-plan row").toBeDefined();
    expect(sn, "sprint has no sprint-planning row").toBeDefined();

    // Asserted as EQUAL TO EACH OTHER rather than against three literals. The literals were the
    // real paths until the seed renamed them, at which point this failed for spelling rather than
    // for drift — and a test that has to be edited on every rename teaches people to edit it
    // without reading it. What must hold is that the two rows are handed the same inputs; what
    // those inputs are called is the seed's business.
    expect([...s0!.reads].sort()).toEqual([...sn!.reads].sort());
    expect(s0!.reads.length, "sprint planning reads the plan, the backlog and the roster").toBe(3);
  });

  it("plans a sprint from one definition, nested by both phases", () => {
    // THIS ASSERTION HAS NOW OUTLIVED TWO MECHANISMS, and the second time is the point.
    //
    // `sprint-0.draft-sprint-plan` and `sprint.sprint-planning` were the same step written twice —
    // sprint 0 ends with sprint 1 planned, every sprint after plans itself. Keeping two copies in
    // step needed machinery: first a shared produced PATH, then a shared declared `output` when the
    // path turned out to be renameable. Both were ways of holding two definitions equal.
    //
    // There is one definition now. Both rows NEST `sprint-plan`, so they cannot differ — the thing
    // that used to be an invariant to police is a fact about the data. `output: sprint` lives on
    // that workflow's drafting row, which is what still gives it the sprint tool and the
    // materialiser that puts commitments on the board.
    const plan = planned();
    const nested = [["sprint-0", "draft-sprint-plan"], ["sprint", "sprint-planning"]].map(
      ([workflow, task]) => {
        const steps = plan.workflows.find((w) => w.row.code === workflow)?.steps ?? [];
        const row = steps.find((x) => x.task === task);
        return { kind: row?.kind, nests: row?.nests };
      },
    );
    expect(nested).toEqual([
      { kind: "workflow", nests: "sprint-plan" },
      { kind: "workflow", nests: "sprint-plan" },
    ]);

    // And the behaviour lives exactly once, on the row that drafts.
    const sp = plan.workflows.find((w) => w.row.code === "sprint-plan")?.steps ?? [];
    expect(sp.filter((x) => x.output === "sprint").map((x) => x.task)).toEqual(["draft-sprint-plan"]);
  });

  it("marks `sprint` as the one phase that repeats", () => {
    const byCode = new Map(planned().workflows.map((w) => [w.row.code, w.row]));
    expect(byCode.get("sprint")?.repeatable).toBe(true);
    expect(byCode.get("sprint-0")?.repeatable).toBe(false);
    expect(byCode.get("onboarding")?.repeatable).toBe(false);
  });

  /**
   * Every phase has an owner, and `onboarding`'s is not the delivery manager's.
   *
   * This asserted one blanket role until `onboarding` moved to `pmo-analyst`, and then failed — for the
   * right reason, so it is rewritten rather than deleted. Provisioning an engagement is platform
   * work: the PMO Analyst is titled "Configures the org and its engagements" in roles.csv and holds
   * `edit-org-defaults`, `edit-engagement-specs` and `manage-users`. The delivery manager runs the
   * delivery, and cannot run it until someone has set the engagement up.
   *
   * `owner_role_code` is not a label. `phasesFor` filters on it, so it decides who can see a phase
   * at all, and `open_workflow_run` falls back to it for any step that names no role.
   */
  it("gives every phase an owner, and onboarding's is the PMO analyst", () => {
    const OWNERS: Record<(typeof PHASES)[number], string> = {
      onboarding: "pmo-analyst",
      "sprint-0": "delivery-manager",
      sprint: "delivery-manager",
    };
    const byCode = new Map(planned().workflows.map((w) => [w.row.code, w.row]));
    for (const code of PHASES) {
      expect(byCode.get(code)?.ownerRole, `${code} has no owner`).toBe(OWNERS[code]);
    }
  });

  it("names an owner role that exists in roles.csv", () => {
    // An owner nobody can hold is a phase nobody can start: `phasesFor` matches the actor's role
    // against this column, so a typo here produces a phase that is invisible to everyone.
    const plan = planned();
    const roles = new Set(plan.roles.map((r) => r.row.code));
    for (const wf of plan.workflows) {
      if (!wf.row.ownerRole) continue;
      expect(roles.has(wf.row.ownerRole), `${wf.row.code} is owned by unknown '${wf.row.ownerRole}'`).toBe(true);
    }
  });

  /**
   * ROWS that would close green over `string_agg` of nothing. Recorded, not allowed.
   *
   * `close_task` builds its refusal from the Done criteria; over zero rows that is NULL, and NULL
   * reads as "nothing blocking". A row with no gate closes with no evidence, indistinguishable from
   * one that passed a real bar.
   *
   * PER ROW, not per workflow. It was per workflow, which meant exempting `sprint-0` to record one
   * ungated row would have stopped policing its other thirteen. The list is longer this way and
   * says more.
   *
   * This also REPLACES a `PHASES`-scoped version of the same assertion. That one checked the three
   * delivery phases and knew nothing about recorded debt, so it was a strict subset of this and
   * the only one that could not express a deferred row.
   *
   * `sprint-0.draft-epics` is the HIGH PRIORITY one and it is different in kind from the rest. It is
   * a NESTING row: its five criteria moved to the `epics` workflow along with the work, which is
   * right, and left the row that opens that work with no bar of its own. Every nesting row has the
   * same hole — this is simply the first one that ever had criteria to lose, which is why the test
   * caught it here and nowhere else. What a nesting row's gate should assert is a real question
   * ("the child run closed" is not something the criteria vocabulary can express today), and it is
   * deferred deliberately rather than by accident.
   *
   * The rest are v1-era workflows that have never had gates. Deleting a name here is how one gets
   * fixed; adding one needs a reason.
   */
  const UNGATED_DEBT = new Set([
    "sprint-0.draft-epics",                          // nesting row — issue #173, see above
    "build.implement-story", "build.write-e2e-tests", "build.review-pr",
    "build.respond-to-review", "build.arbitrate-dispute", "build.approve",
    "build.mechanical check",
    "fix.triage-and-fix", "fix.write-e2e-tests", "fix.review-pr",
    "fix.respond-to-review", "fix.approve", "fix.accumulate-changelog",
    "tech-design.design-story-tech",
    "triage.classify-intake", "triage.approve", "triage.triage-incident",
    "triage.triage-and-fix", "triage.review-pr", "triage.write-postmortem",
    "triage.accumulate-changelog",
  ]);

  it("gives every row of every enabled workflow a Done gate", () => {
    const offenders: string[] = [];
    for (const wf of planned().workflows) {
      if (!wf.row.enabled) continue;
      for (const step of wf.steps) {
        const id = `${wf.row.code}.${step.task}`;
        if (UNGATED_DEBT.has(id)) continue;
        const gates = wf.criteria.filter((c) => c.kind === "done" && c.stepTask === step.task);
        if (!gates.length) offenders.push(id);
      }
    }
    expect(offenders, "these rows would close green over string_agg of nothing").toEqual([]);
  });

  it("keeps the ungated-row debt honest", () => {
    // A name here that no longer needs to be is a stale exemption, and a stale exemption is how the
    // list stops meaning anything.
    const plan = planned();
    const stale: string[] = [];
    for (const id of UNGATED_DEBT) {
      const [code, ...rest] = id.split(".");
      const task = rest.join(".");
      const wf = plan.workflows.find((w) => w.row.code === code);
      if (!wf || !wf.row.enabled) continue;                       // parked or gone: nothing to police
      if (!wf.steps.some((s) => s.task === task)) continue;        // row gone: nothing to police
      const gated = wf.criteria.some((c) => c.kind === "done" && c.stepTask === task);
      if (gated) stale.push(id);
    }
    expect(stale, "these are gated now — remove them from UNGATED_DEBT").toEqual([]);
  });

  it("only a `workflow` step nests, and it nests something that exists", () => {
    const codes = new Set(planned().workflows.map((w) => w.row.code));
    for (const wf of planned().workflows) {
      for (const s of wf.steps) {
        if (s.kind === "workflow") {
          expect(s.nests, `${wf.row.code} step ${s.ord} nests nothing`).toBeTruthy();
          expect(codes.has(s.nests), `${wf.row.code} step ${s.ord} nests unknown '${s.nests}'`).toBe(true);
        } else {
          expect(s.nests, `${wf.row.code} step ${s.ord} is ${s.kind} but nests`).toBe("");
        }
      }
    }
  });

  it("opens everything else off the kickoff backlog, not off project creation", () => {
    const rest = planned().workflows.filter((w) => w.row.code !== "plan-kickoff");
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.every((w) => w.row.trigger !== "project-created")).toBe(true);
  });
});

/* ── unknown references are refused, never created ───────────────────────── */

describe("refuses rather than invents", () => {
  const base: Bundle = {
    workstreams: "code,label\nEngineering,Engineering\n",
    roles: "code,label,tier,scope,workstream\nengineer,Engineer,practitioner,mine,Engineering\n",
    workflows: "code,label,workstream\nbuild,Build,Engineering\n",
    steps: "workflow,ord,kind,role,task\nbuild,1,agent,engineer,implement\n",
    criteria: "workflow,task,kind,text\nbuild,implement,done,tests pass\n",
  };

  it("accepts the baseline", () => {
    expect(planImport(base, empty).ok).toBe(true);
  });

  it("rejects a misspelled workstream instead of creating it", () => {
    const r = planImport({ ...base, roles: "code,label,tier,scope,workstream\nengineer,Engineer,practitioner,mine,Enginering\n" }, empty);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems[0].message).toContain("Enginering");
    expect(r.problems[0].fix).toContain("Nothing is created implicitly");
  });

  it("rejects a step whose role does not exist", () => {
    const r = planImport({ ...base, steps: "workflow,ord,kind,role,task\nbuild,1,agent,ghost,implement\n" }, empty);
    expect(r.ok).toBe(false);
  });

  it("rejects a step attached to a workflow that is not being defined", () => {
    const r = planImport({ ...base, steps: "workflow,ord,kind,role,task\nnosuch,1,agent,engineer,implement\n" }, empty);
    expect(r.ok).toBe(false);
  });

  it("rejects a role naming an agent file that does not exist", () => {
    const withAgent = { ...base, roles: "code,label,tier,scope,workstream,agent\nengineer,Engineer,practitioner,mine,Engineering,nonexistent\n" };
    const r = planImport(withAgent, { ...empty, agents: ["pm", "engineer"] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems[0].message).toContain("compass/agents/nonexistent.md does not exist");
    expect(r.problems[0].fix).toContain("can never dispatch");
  });
});

/* ── a job pointed at a document that will never exist ───────────────────── */

describe("reads must resolve", () => {
  const base: Bundle = {
    workstreams: "code,label\nDelivery,Delivery\n",
    roles: "code,label,tier,scope,workstream\ndm,DM,oversight,everyone,Delivery\n",
    workflows: "code,label,workstream\nplan,Plan,Delivery\n",
    criteria: "workflow,task,kind,text\nplan,shape,done,done\n",
  };
  const withDocs: Existing = { ...empty, documents: ["02-scope/sow", "01-foundation/ways-of-working"] };

  it("accepts a read that names a real document", () => {
    const r = planImport({ ...base, steps: 'workflow,ord,kind,role,task,produces,reads\nplan,1,agent,dm,shape,,"02-scope/sow"\n' }, withDocs);
    expect(r.ok).toBe(true);
  });

  it("rejects a plausible-looking path that does not exist — the bug this check exists for", () => {
    const r = planImport({ ...base, steps: 'workflow,ord,kind,role,task,produces,reads\nplan,1,agent,dm,shape,,"02-scope-sow/sow-source.md"\n' }, withDocs);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems[0].message).toContain("02-scope-sow/sow-source.md");
    expect(r.problems[0].fix).toContain("fails when someone clicks the card");
  });

  it("accepts a read of a document an earlier workflow produces", () => {
    const r = planImport({ ...base,
      workflows: "code,label,workstream\nplan,Plan,Delivery\nstaff,Staff,Delivery\n",
      steps: 'workflow,ord,kind,role,task,produces,reads\n' +
             'plan,1,agent,dm,shape,01-foundation/kickoff-backlog,"02-scope/sow"\n' +
             'staff,1,agent,dm,staff,,"01-foundation/kickoff-backlog"\n',
      criteria: "workflow,task,kind,text\nplan,shape,done,done\nstaff,staff,done,done\n",
    }, withDocs);
    expect(r.ok).toBe(true);
  });

  it("skips the check when nothing is known about documents, rather than failing everything", () => {
    const r = planImport({ ...base, steps: 'workflow,ord,kind,role,task,produces,reads\nplan,1,agent,dm,shape,,"anything/at/all"\n' }, empty);
    expect(r.ok).toBe(true);
  });
});

/* ── the constraints that stop a false green ─────────────────────────────── */

describe("guards against checks that never evaluate", () => {
  const base: Bundle = {
    workstreams: "code,label\nEngineering,Engineering\n",
    roles: "code,label,tier,scope,workstream\nengineer,Engineer,practitioner,mine,Engineering\n",
    workflows: "code,label,workstream\nbuild,Build,Engineering\n",
    steps: "workflow,ord,kind,role,task\nbuild,1,agent,engineer,implement\n",
  };

  it("rejects a half-specified criterion", () => {
    const r = planImport({ ...base, criteria: "workflow,task,kind,text,subject_kind,subject_ref,operator,value\nbuild,implement,done,,ticket,KAN-1,,\n" }, empty);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems[0].fix).toContain("never evaluates");
  });

  it("accepts a fully-specified check and a pure judgment criterion", () => {
    const r = planImport({ ...base, criteria:
      "workflow,task,kind,text,subject_kind,subject_ref,operator,value\n" +
      "build,implement,done,,ticket,KAN-1,status,Done\n" +
      "build,implement,done,The acceptance criteria are actually met,,,,\n" }, empty);
    expect(r.ok).toBe(true);
  });

  it("rejects a criterion with neither a check nor any text", () => {
    const r = planImport({ ...base, criteria: "workflow,task,kind,text\nbuild,implement,done,\n" }, empty);
    expect(r.ok).toBe(false);
  });

  it("rejects a criterion naming a task that does not exist", () => {
    const r = planImport({ ...base, criteria: "workflow,task,kind,text\nbuild,implemnt,done,something\n" }, empty);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems[0].message).toContain("'implemnt'");
    expect(r.problems[0].fix).toContain("name a row that exists");
  });
});

/* ── work nobody holds must not become a card ────────────────────────────── */

describe("machine checks are not work", () => {
  const base: Bundle = {
    workstreams: "code,label\nEngineering,Engineering\n",
    roles: "code,label,tier,scope,workstream\nengineer,Engineer,practitioner,mine,Engineering\n",
    workflows: "code,label,workstream\nbuild,Build,Engineering\n",
    criteria: "workflow,task,kind,text\nbuild,,done,merged\n",
  };

  it("rejects a machine step that names a role", () => {
    const r = planImport({ ...base, steps: "workflow,ord,kind,role,task\nbuild,1,machine,engineer,ci\n" }, empty);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems[0].fix).toContain("Nobody holds a machine check");
  });

  it("accepts a machine step with no role", () => {
    const r = planImport({ ...base, steps: "workflow,ord,kind,role,task\nbuild,1,machine,,ci\n" }, empty);
    expect(r.ok).toBe(true);
  });

  it("rejects an agent step with no role, which would land in nobody's queue", () => {
    const r = planImport({ ...base, steps: "workflow,ord,kind,role,task\nbuild,1,agent,,implement\n" }, empty);
    expect(r.ok).toBe(false);
  });
});

/* ── re-uploading is how a practice publishes a new version ──────────────── */

describe("import is versioning", () => {
  const bundle: Bundle = {
    workstreams: "code,label\nEngineering,Engineering\n",
    roles: "code,label,tier,scope,workstream\nengineer,Engineer,practitioner,mine,Engineering\n",
    workflows: "code,label,workstream\nbuild,Build,Engineering\n",
    steps: "workflow,ord,kind,role,task\nbuild,1,agent,engineer,implement\n",
    criteria: "workflow,task,kind,text\nbuild,implement,done,tests pass\n",
  };

  const already: Existing = {
    workstreams: ["Engineering"], roles: ["engineer"], agents: [], phases: [], documents: [],
    workflows: [{
      code: "build",
      steps: [{ workflow: "build", ord: 1, kind: "agent", role: "engineer", task: "implement", produces: "", output: "", reads: [], conditional: "", nests: "", title: "", dependsOn: [] }],
      criteria: [{ workflow: "build", stepTask: "implement", kind: "done", text: "tests pass", subjectKind: "", subjectRef: "", operator: "", value: "" }],
    }],
  };

  it("re-uploading an unchanged workflow changes nothing", () => {
    const r = planImport(bundle, already);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.workflows[0].action).toBe("unchanged");
    expect(r.plan.workflows[0].changes).toEqual([]);
  });

  it("adding a step produces a new version, with a readable reason", () => {
    const r = planImport(
      { ...bundle, steps: bundle.steps + "build,2,agent,engineer,write-tests\n" },
      already,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.workflows[0].action).toBe("new-version");
    expect(r.plan.workflows[0].changes.join(" ")).toContain("step(s) added");
  });

  it("changing ONLY depends_on produces a new version", () => {
    // The `nests`/`title` bug, in the newest column. A row that changes what it derives from has
    // changed — if the diff key omits the field, the importer reports "unchanged" and the edit is
    // silently discarded. Every field a step carries belongs in that key, and this is the test that
    // says so for this one.
    const r = planImport(
      {
        ...bundle,
        steps: "workflow,ord,kind,role,task,depends_on\n"
             + "build,1,agent,engineer,implement,\n"
             + "build,2,agent,engineer,write-tests,implement\n",
      },
      {
        ...already,
        workflows: [{
          ...already.workflows[0],
          steps: [
            already.workflows[0].steps[0],
            { workflow: "build", ord: 2, kind: "agent", role: "engineer", task: "write-tests",
              produces: "", output: "", reads: [], conditional: "", nests: "", title: "", dependsOn: [] },
          ],
        }],
      },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.workflows[0].action).toBe("new-version");
  });

  it("tightening a criterion produces a new version — the CoP improvement loop", () => {
    const r = planImport(
      { ...bundle, criteria: "workflow,task,kind,text\nbuild,implement,done,tests pass and coverage holds\n" },
      already,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.workflows[0].action).toBe("new-version");
  });

  it("existing workstreams and roles are left alone rather than recreated", () => {
    const r = planImport(bundle, already);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.workstreams[0].action).toBe("unchanged");
    expect(r.plan.roles[0].action).toBe("unchanged");
  });
});

/* ── problems are reported together, not one at a time ───────────────────── */

describe("reporting", () => {
  it("collects every problem in one pass, with file and row", () => {
    const r = planImport({
      workstreams: "code,label\nEngineering,Engineering\n",
      roles: "code,label,tier,scope,workstream\nengineer,Engineer,wizard,mine,Nope\n",
      workflows: "code,label,workstream\nbuild,Build,AlsoNope\n",
      steps: "workflow,ord,kind,role,task\nbuild,1,agent,ghost,implement\n",
    }, empty);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems.length).toBeGreaterThanOrEqual(4);
    expect(r.problems.every((p) => p.file && p.fix)).toBe(true);
  });
});

/* ── a document criterion must check its own step's promise ──────────────── */

// Slug binding stops a criterion sliding when the steps are renumbered. It does NOT stop one being
// pointed at the wrong document to begin with, which is what this describe covers.
describe("a document criterion checks what its own step produces", () => {
  const base: Bundle = {
    workstreams: "code,label\nDelivery,Delivery\n",
    roles: "code,label,tier,scope,workstream\ndm,DM,oversight,everyone,Delivery\n",
    workflows: "code,label,workstream\nsprint-0,Sprint 0,Delivery\n",
    steps:
      "workflow,ord,kind,role,task,produces\n" +
      "sprint-0,1,agent,dm,file-sow,02-scope/sow\n" +
      "sprint-0,2,agent,dm,draft-timeline,02-scope/timeline\n",
    criteria:
      "workflow,task,kind,text,subject_kind,subject_ref,operator,value\n" +
      "sprint-0,file-sow,done,The SOW is filed,document,02-scope/sow,status,published\n" +
      "sprint-0,draft-timeline,done,The timeline is published,document,02-scope/timeline,status,published\n",
  };

  it("accepts criteria that match their step", () => {
    expect(planImport(base, empty).ok).toBe(true);
  });

  // The false green, and the worse of the two. Step 2's gate is satisfied the moment step 1
  // publishes, so the row closes on another row's work — indistinguishable from the timeline
  // actually existing.
  it("rejects a criterion checking a document a DIFFERENT step produces", () => {
    const r = planImport({ ...base,
      criteria:
        "workflow,task,kind,text,subject_kind,subject_ref,operator,value\n" +
        "sprint-0,file-sow,done,The SOW is filed,document,02-scope/sow,status,published\n" +
        "sprint-0,draft-timeline,done,The timeline is published,document,02-scope/sow,status,published\n",
    }, empty);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const p = r.problems.find((x) => x.message.includes("draft-timeline"))!;
    expect(p.message).toContain("produces '02-scope/timeline'");
    expect(p.message).toContain("which 'file-sow' produces");
    expect(p.fix).toContain("closes on another row's work");
  });

  // The other direction: the row can never close, because nothing will ever publish that path.
  // This is what sprint-0 step 9 had — a review criterion left behind when the review row went.
  it("rejects a criterion checking a document no step produces", () => {
    const r = planImport({ ...base,
      criteria:
        "workflow,task,kind,text,subject_kind,subject_ref,operator,value\n" +
        "sprint-0,file-sow,done,The SOW is filed,document,02-scope/sow,status,published\n" +
        "sprint-0,draft-timeline,done,Findings recorded,document,04-governance/decisions,status,published\n",
    }, empty);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const p = r.problems.find((x) => x.message.includes("draft-timeline"))!;
    expect(p.message).toContain("which no row here produces");
    expect(p.fix).toContain("can never close");
  });

  // A judgment criterion has no subject at all, and a phase-wide criterion has no step to
  // contradict. Neither may be dragged into this.
  it("leaves judgment and phase-wide criteria alone", () => {
    const r = planImport({ ...base,
      criteria:
        "workflow,task,kind,text,subject_kind,subject_ref,operator,value\n" +
        "sprint-0,file-sow,done,The SOW is filed,document,02-scope/sow,status,published\n" +
        "sprint-0,draft-timeline,done,Every milestone has a date,,,,\n" +
        "sprint-0,,ready,The systems of record answered,connector,docs,is,wired\n",
    }, empty);
    expect(r.ok).toBe(true);
  });

  // A step that promises nothing has nothing to contradict — and a criterion may legitimately
  // check a document produced in an earlier phase.
  it("says nothing about a step with no produces", () => {
    const r = planImport({ ...base,
      steps:
        "workflow,ord,kind,role,task,produces\n" +
        "sprint-0,1,agent,dm,file-sow,02-scope/sow\n" +
        "sprint-0,2,agent,dm,review,\n",
      criteria:
        "workflow,task,kind,text,subject_kind,subject_ref,operator,value\n" +
        "sprint-0,file-sow,done,The SOW is filed,document,02-scope/sow,status,published\n" +
        "sprint-0,review,done,The SOW was read,document,02-scope/sow,status,published\n",
    }, empty);
    expect(r.ok).toBe(true);
  });
});

/* ── renumbering the steps must not move a single criterion ──────────────── */

// The defect this binding exists to kill, reproduced.
//
// sprint-0 absorbed pre-sprint-0's rows and the steps were renumbered. criteria.csv was not touched
// — not one line changed — and seven of twelve rows silently acquired a different row's gate: the
// timeline row asked for the product brief, the staffing row asked for the timeline, the
// sprint-plan row checked the delivery plan that step 8 publishes. Nothing failed, because a
// permuted ordinal still names a real step.
//
// Under ordinal binding this test fails. Under slug binding the ords are free to move.
describe("criteria survive their steps being renumbered", () => {
  const criteria =
    "workflow,task,kind,text,subject_kind,subject_ref,operator,value\n" +
    "sprint-0,file-sow,done,The SOW is filed,document,02-scope/sow,status,published\n" +
    "sprint-0,draft-product-brief,done,The brief is published,document,01-foundation/product-brief,status,published\n" +
    "sprint-0,draft-timeline,done,The timeline is published,document,02-scope/timeline,status,published\n";

  const bundle = (steps: string): Bundle => ({
    workstreams: "code,label\nDelivery,Delivery\n",
    roles: "code,label,tier,scope,workstream\ndm,DM,oversight,everyone,Delivery\n",
    workflows: "code,label,workstream\nsprint-0,Sprint 0,Delivery\n",
    steps, criteria,
  });

  const ORIGINAL =
    "workflow,ord,kind,role,task,produces\n" +
    "sprint-0,1,agent,dm,file-sow,02-scope/sow\n" +
    "sprint-0,2,agent,dm,draft-product-brief,01-foundation/product-brief\n" +
    "sprint-0,3,agent,dm,draft-timeline,02-scope/timeline\n";

  // The same three rows, renumbered — exactly what absorbing a phase does. The brief moves from 2
  // to 3 and the timeline from 3 to 2.
  const RENUMBERED =
    "workflow,ord,kind,role,task,produces\n" +
    "sprint-0,1,agent,dm,file-sow,02-scope/sow\n" +
    "sprint-0,2,agent,dm,draft-timeline,02-scope/timeline\n" +
    "sprint-0,3,agent,dm,draft-product-brief,01-foundation/product-brief\n";

  const gateFor = (steps: string, task: string) => {
    const r = planImport(bundle(steps), empty);
    if (!r.ok) throw new Error(r.problems.map((p) => p.message).join("\n"));
    return r.plan.workflows[0].criteria.filter((c) => c.stepTask === task).map((c) => c.subjectRef);
  };

  it("binds each criterion to the same row before and after", () => {
    for (const task of ["file-sow", "draft-product-brief", "draft-timeline"]) {
      expect(gateFor(RENUMBERED, task), `${task} changed gate when renumbered`)
        .toEqual(gateFor(ORIGINAL, task));
    }
  });

  it("keeps the timeline row asking for the timeline, not the brief", () => {
    expect(gateFor(RENUMBERED, "draft-timeline")).toEqual(["02-scope/timeline"]);
    expect(gateFor(RENUMBERED, "draft-product-brief")).toEqual(["01-foundation/product-brief"]);
  });

  // The diff key must see the move too. A key that omits the binding reports "unchanged" when a
  // criterion changes rows — the same class of defect as the one being fixed, one layer up.
  it("reports a criterion moved to a different row as a change", () => {
    const before = planImport(bundle(ORIGINAL), empty);
    if (!before.ok) throw new Error("fixture does not plan");
    const w = before.plan.workflows[0];

    const moved = criteria.replace("sprint-0,draft-timeline,done,The timeline is published",
                                   "sprint-0,file-sow,done,The timeline is published");
    const r = planImport(
      { ...bundle(ORIGINAL), criteria: moved },
      { ...empty, workstreams: ["Delivery"], roles: ["dm"],
        workflows: [{ code: "sprint-0", steps: w.steps, criteria: w.criteria }] },
    );
    // It refuses outright — file-sow produces the SOW, so the moved criterion now checks another
    // row's document. Refusing is a stronger answer than reporting it as a change.
    expect(r.ok).toBe(false);
  });
});
