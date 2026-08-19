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
    // old design: creating a project silently opened work. Basecamp is initiated by the delivery
    // manager instead, because an engagement existing is not the same as an engagement being ready
    // to start — the admin may create it days before anyone is available to run it.
    const selfStarting = planned().workflows.filter((w) => w.row.trigger);
    expect(selfStarting.map((w) => w.row.code)).toEqual([]);
  });

  it("seeds basecamp and groundwork, owned by the delivery manager", () => {
    const byCode = new Map(planned().workflows.map((w) => [w.row.code, w.row]));
    expect(byCode.get("basecamp")?.ownerRole).toBe("delivery-manager");
    expect(byCode.get("groundwork")?.ownerRole).toBe("delivery-manager");
  });

  it("gives every basecamp and groundwork row a Done gate", () => {
    // The vacuous-close bug: close_task builds its refusal with string_agg over the Done criteria,
    // and over zero rows that returns NULL — so a step with no criteria closes green with no
    // evidence at all. A phase whose rows have no gates is worse than no phase.
    for (const code of ["basecamp", "groundwork"]) {
      const wf = planned().workflows.find((w) => w.row.code === code)!;
      for (const step of wf.steps) {
        const gates = wf.criteria.filter((c) => c.kind === "done" && c.stepOrd === step.ord);
        expect(gates.length, `${code} step ${step.ord} has no Done criteria`).toBeGreaterThan(0);
      }
    }
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
    criteria: "workflow,ord,kind,text\nbuild,1,done,tests pass\n",
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
    criteria: "workflow,ord,kind,text\nplan,1,done,done\n",
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
      criteria: "workflow,ord,kind,text\nplan,1,done,done\nstaff,1,done,done\n",
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
    const r = planImport({ ...base, criteria: "workflow,ord,kind,text,subject_kind,subject_ref,operator,value\nbuild,1,done,,ticket,KAN-1,,\n" }, empty);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems[0].fix).toContain("never evaluates");
  });

  it("accepts a fully-specified check and a pure judgment criterion", () => {
    const r = planImport({ ...base, criteria:
      "workflow,ord,kind,text,subject_kind,subject_ref,operator,value\n" +
      "build,1,done,,ticket,KAN-1,status,Done\n" +
      "build,1,done,The acceptance criteria are actually met,,,,\n" }, empty);
    expect(r.ok).toBe(true);
  });

  it("rejects a criterion with neither a check nor any text", () => {
    const r = planImport({ ...base, criteria: "workflow,ord,kind,text\nbuild,1,done,\n" }, empty);
    expect(r.ok).toBe(false);
  });

  it("rejects a criterion pointing at a step that does not exist", () => {
    const r = planImport({ ...base, criteria: "workflow,ord,kind,text\nbuild,9,done,something\n" }, empty);
    expect(r.ok).toBe(false);
  });
});

/* ── work nobody holds must not become a card ────────────────────────────── */

describe("machine checks are not work", () => {
  const base: Bundle = {
    workstreams: "code,label\nEngineering,Engineering\n",
    roles: "code,label,tier,scope,workstream\nengineer,Engineer,practitioner,mine,Engineering\n",
    workflows: "code,label,workstream\nbuild,Build,Engineering\n",
    criteria: "workflow,ord,kind,text\nbuild,,done,merged\n",
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
    criteria: "workflow,ord,kind,text\nbuild,1,done,tests pass\n",
  };

  const already: Existing = {
    workstreams: ["Engineering"], roles: ["engineer"], agents: [], phases: [], documents: [],
    workflows: [{
      code: "build",
      steps: [{ workflow: "build", ord: 1, kind: "agent", role: "engineer", task: "implement", produces: "", reads: [], conditional: "", nests: "" }],
      criteria: [{ workflow: "build", stepOrd: 1, kind: "done", text: "tests pass", subjectKind: "", subjectRef: "", operator: "", value: "" }],
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

  it("tightening a criterion produces a new version — the CoP improvement loop", () => {
    const r = planImport(
      { ...bundle, criteria: "workflow,ord,kind,text\nbuild,1,done,tests pass and coverage holds\n" },
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
