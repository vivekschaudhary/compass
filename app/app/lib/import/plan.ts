// Turn a bundle of CSVs into a reviewable plan — or into errors that say what to fix.
//
// Pure: no database, no network. It takes the CSV text and a snapshot of what already exists, and
// returns what would change. That makes it testable without a fixture, and it makes "show the diff
// before you apply it" the natural shape rather than an extra feature.
//
// THE RULE THAT MATTERS: unknown references are REFUSED, never created. A typo in `workstream`
// must not quietly invent a practice called `Enginering` that then owns a workflow nobody can
// find. Same instinct the framework already has — refuse, and name the one next move.

import { parseRecords, parseList, parseBool } from "./csv";

/* ── what a bundle contains ──────────────────────────────────────────────── */

export type Bundle = {
  workstreams?: string;
  roles?: string;
  workflows?: string;
  steps?: string;
  criteria?: string;
};

/* ── the shapes, after parsing ───────────────────────────────────────────── */

export type WorkstreamRow = { code: string; label: string; ord: number; enabled: boolean };
export type RoleRow = {
  code: string; label: string; title: string; tier: string; scope: string;
  workstream: string; agent: string; hosts: string[]; capabilities: string[];
};
export type WorkflowRow = {
  code: string; label: string; workstream: string; phase: string;
  ownerRole: string; trigger: string; enabled: boolean;
};
export type StepRow = {
  workflow: string; ord: number; kind: string; role: string; task: string;
  produces: string; reads: string[]; conditional: string;
  /** `kind: workflow` only — the workflow this row nests. The row is done when that run closes. */
  nests: string;
  /** What a person calls this row. The queue showed `propose-kickoff-backlog` without it. */
  title: string;
  /**
   * Task slugs of rows this one derives from, in the same workflow — by SLUG, not ord, so a
   * delivery manager reordering rows while reviewing the plan does not silently re-point every
   * edge. The database enforces that each names a row ABOVE this one, which makes a cycle
   * impossible to write rather than something to detect.
   */
  dependsOn: string[];
};
export type CriterionRow = {
  workflow: string; stepOrd: number | null; kind: string; text: string;
  subjectKind: string; subjectRef: string; operator: string; value: string;
};

/** What the database already holds, so the plan can tell new from changed. */
export type Existing = {
  workstreams: string[];
  roles: string[];
  agents: string[];               // compass/agents/*.md that actually exist on disk
  phases: string[];
  /** Document paths that exist on the engagement, so `reads` can be checked against reality. */
  documents: string[];
  workflows: { code: string; steps: StepRow[]; criteria: CriterionRow[] }[];
};

export type Problem = { file: string; row: number | null; message: string; fix: string };

export type Plan = {
  workstreams: { action: "create" | "unchanged"; row: WorkstreamRow }[];
  roles: { action: "create" | "unchanged"; row: RoleRow }[];
  workflows: {
    action: "create" | "new-version" | "unchanged";
    row: WorkflowRow;
    steps: StepRow[];
    criteria: CriterionRow[];
    /** Why a new version — the human-readable diff, for the confirmation screen. */
    changes: string[];
  }[];
};

export type PlanResult =
  | { ok: true; plan: Plan; summary: string }
  | { ok: false; problems: Problem[] };

const TIERS = ["oversight", "practitioner", "platform"];
const SCOPES = ["mine", "workstream", "everyone"];
// `workflow` joins them: a row may be satisfied by a whole nested run rather than one task.
// Previously anything larger than a single task had to BE a top-level workflow, which is how one
// engagement ended up with nine peer runs holding six tasks.
const STEP_KINDS = ["agent", "hitl", "machine", "workflow"];
const CRITERION_KINDS = ["ready", "done"];

/* ── parsing ─────────────────────────────────────────────────────────────── */

const num = (s: string, fallback = 0) => (s === "" ? fallback : Number(s));

function readWorkstreams(csv: string): WorkstreamRow[] {
  return parseRecords(csv).map((r) => ({
    code: r.code, label: r.label || r.code, ord: num(r.ord), enabled: parseBool(r.enabled),
  }));
}

function readRoles(csv: string): RoleRow[] {
  return parseRecords(csv).map((r) => ({
    code: r.code, label: r.label || r.code, title: r.title ?? "",
    tier: r.tier || "practitioner", scope: r.scope || "mine",
    workstream: r.workstream ?? "", agent: r.agent ?? "",
    hosts: parseList(r.hosts), capabilities: parseList(r.capabilities),
  }));
}

function readWorkflows(csv: string): WorkflowRow[] {
  return parseRecords(csv).map((r) => ({
    code: r.code, label: r.label || r.code, workstream: r.workstream ?? "",
    phase: r.phase ?? "", ownerRole: r.owner_role ?? "", trigger: r.trigger ?? "",
    enabled: parseBool(r.enabled),
  }));
}

function readSteps(csv: string): StepRow[] {
  return parseRecords(csv).map((r) => ({
    workflow: r.workflow, ord: num(r.ord), kind: r.kind || "agent", role: r.role ?? "",
    task: r.task ?? "", produces: r.produces ?? "", reads: parseList(r.reads),
    conditional: r.conditional ?? "", nests: r.nests ?? "", title: r.title ?? "",
    dependsOn: parseList(r.depends_on),
  }));
}

function readCriteria(csv: string): CriterionRow[] {
  return parseRecords(csv).map((r) => ({
    workflow: r.workflow, stepOrd: r.ord === "" ? null : num(r.ord), kind: r.kind,
    text: r.text ?? "", subjectKind: r.subject_kind ?? "", subjectRef: r.subject_ref ?? "",
    operator: r.operator ?? "", value: r.value ?? "",
  }));
}

/* ── the plan ────────────────────────────────────────────────────────────── */

export function planImport(bundle: Bundle, existing: Existing): PlanResult {
  const problems: Problem[] = [];
  const add = (file: string, row: number | null, message: string, fix: string) =>
    problems.push({ file, row, message, fix });

  const workstreams = readWorkstreams(bundle.workstreams ?? "");
  const roles = readRoles(bundle.roles ?? "");
  const workflows = readWorkflows(bundle.workflows ?? "");
  const steps = readSteps(bundle.steps ?? "");
  const criteria = readCriteria(bundle.criteria ?? "");

  // Codes available after this import: what exists already, plus what the bundle declares.
  const knownWorkstreams = new Set([...existing.workstreams, ...workstreams.map((w) => w.code)]);
  const knownRoles = new Set([...existing.roles, ...roles.map((r) => r.code)]);
  const knownWorkflows = new Set(workflows.map((w) => w.code));

  // Generic: used for both codes and step numbers.
  const dupes = <T>(xs: T[]): T[] => xs.filter((x, i) => xs.indexOf(x) !== i);

  /* workstreams */
  workstreams.forEach((w, i) => {
    if (!w.code) add("workstreams.csv", i + 2, "A workstream has no code.", "Give it a short code, e.g. Engineering.");
  });
  dupes(workstreams.map((w) => w.code)).forEach((c) =>
    add("workstreams.csv", null, `Workstream '${c}' appears more than once.`, "Remove the duplicate row."));

  /* roles */
  roles.forEach((r, i) => {
    const row = i + 2;
    if (!r.code) add("roles.csv", row, "A role has no code.", "Give it a code, e.g. data-engineer.");
    if (!TIERS.includes(r.tier))
      add("roles.csv", row, `Role '${r.code}' has tier '${r.tier}'.`, `Use one of: ${TIERS.join(", ")}.`);
    if (!SCOPES.includes(r.scope))
      add("roles.csv", row, `Role '${r.code}' has scope '${r.scope}'.`, `Use one of: ${SCOPES.join(", ")}.`);
    if (r.workstream && !knownWorkstreams.has(r.workstream))
      add("roles.csv", row, `Role '${r.code}' names workstream '${r.workstream}', which does not exist.`,
        "Add it to workstreams.csv, or correct the spelling. Nothing is created implicitly.");
    if (r.agent && existing.agents.length > 0 && !existing.agents.includes(r.agent))
      add("roles.csv", row, `Role '${r.code}' names agent '${r.agent}', but compass/agents/${r.agent}.md does not exist.`,
        "A role whose agent file is missing can never dispatch work — it produces an empty queue forever.");
    if (r.capabilities.includes("manage-roles"))
      add("roles.csv", row, `Role '${r.code}' grants 'manage-roles'.`,
        "That capability is fixed in code. If it were data, a role able to edit roles could grant itself everything.");
  });
  dupes(roles.map((r) => r.code)).forEach((c) =>
    add("roles.csv", null, `Role '${c}' appears more than once.`, "Remove the duplicate row."));

  /* workflows */
  workflows.forEach((w, i) => {
    const row = i + 2;
    if (!w.code) add("workflows.csv", row, "A workflow has no code.", "Give it a code, e.g. staff-engagement.");
    if (!w.workstream)
      add("workflows.csv", row, `Workflow '${w.code}' names no workstream.`, "Every workflow is owned by exactly one practice.");
    else if (!knownWorkstreams.has(w.workstream))
      add("workflows.csv", row, `Workflow '${w.code}' names workstream '${w.workstream}', which does not exist.`,
        "Add it to workstreams.csv, or correct the spelling.");
    if (w.phase && existing.phases.length > 0 && !existing.phases.includes(w.phase))
      add("workflows.csv", row, `Workflow '${w.code}' names phase '${w.phase}', which does not exist.`,
        "Add the phase first, or leave the column empty — a phase is a display band and is optional.");
    if (w.ownerRole && !knownRoles.has(w.ownerRole))
      add("workflows.csv", row, `Workflow '${w.code}' is owned by role '${w.ownerRole}', which does not exist.`,
        "Add it to roles.csv, or correct the spelling.");
  });
  dupes(workflows.map((w) => w.code)).forEach((c) =>
    add("workflows.csv", null, `Workflow '${c}' appears more than once.`, "Remove the duplicate row."));

  /* steps */
  steps.forEach((s, i) => {
    const row = i + 2;
    if (!knownWorkflows.has(s.workflow))
      add("workflow-steps.csv", row, `Step ${s.ord} belongs to workflow '${s.workflow}', which is not in this import.`,
        "Add the workflow to workflows.csv. Steps cannot be attached to a workflow that is not being defined.");
    if (!STEP_KINDS.includes(s.kind))
      add("workflow-steps.csv", row, `Step ${s.workflow}/${s.ord} has kind '${s.kind}'.`, `Use one of: ${STEP_KINDS.join(", ")}.`);
    if (!s.task)
      add("workflow-steps.csv", row, `Step ${s.workflow}/${s.ord} has no task.`, "Name what the step does, e.g. propose-staffing.");
    if (s.kind === "machine" && s.role)
      add("workflow-steps.csv", row, `Step ${s.workflow}/${s.ord} is a machine check but names role '${s.role}'.`,
        "Nobody holds a machine check. Leave role empty, or make it a criterion on a gate instead of a step.");

    // A nesting row must name what it nests, and a non-nesting row must not. Caught here rather
    // than left to the database so the import reports it with a file and a row number — a check
    // constraint violation surfaces as a 400 with no idea which line caused it.
    if (s.kind === "workflow" && !s.nests)
      add("workflow-steps.csv", row, `Step ${s.workflow}/${s.ord} nests a workflow but names none.`,
        "Put the workflow's code in the `nests` column, e.g. create-product-brief.");
    if (s.kind !== "workflow" && s.nests)
      add("workflow-steps.csv", row, `Step ${s.workflow}/${s.ord} names nests='${s.nests}' but its kind is '${s.kind}'.`,
        "Only a `workflow` step nests. Change the kind, or clear the nests column.");
    if (s.kind === "workflow" && s.nests && !knownWorkflows.has(s.nests))
      add("workflow-steps.csv", row, `Step ${s.workflow}/${s.ord} nests '${s.nests}', which is not in this import.`,
        "A row cannot nest a workflow that does not exist — add it, or point at one that does.");
    if (s.kind !== "machine" && !s.role)
      add("workflow-steps.csv", row, `Step ${s.workflow}/${s.ord} names no role.`,
        "A step someone has to hold needs a role, or it lands in nobody's queue.");
    if (s.role && !knownRoles.has(s.role))
      add("workflow-steps.csv", row, `Step ${s.workflow}/${s.ord} names role '${s.role}', which does not exist.`,
        "Add it to roles.csv, or correct the spelling.");
  });
  workflows.forEach((w) => {
    const ords = steps.filter((s) => s.workflow === w.code).map((s) => s.ord);
    dupes(ords).forEach((o) =>
      add("workflow-steps.csv", null, `Workflow '${w.code}' has two steps numbered ${o}.`, "Step numbers order the graph and must be unique."));
  });

  // A step can only read a document that exists, or one an earlier workflow produces. Anything
  // else is a job whose agent is pointed at nothing — and it fails at RUN time, in front of
  // whoever clicked it, rather than at import.
  //
  // This check exists because the first seed read `02-scope-sow/sow-source.md` while the real
  // tree had `02-scope/sow`. Nothing caught it: the criteria that would have are not evaluated
  // yet, and a plausible-looking path is invisible by eye.
  const produced = new Set(steps.map((s) => s.produces).filter(Boolean));
  if (existing.documents.length > 0) {
    const known = new Set([...existing.documents, ...produced]);
    steps.forEach((s, i) => {
      s.reads.filter((r) => !known.has(r)).forEach((r) =>
        add("workflow-steps.csv", i + 2,
          `Step ${s.workflow}/${s.ord} reads '${r}', which is not a document on this engagement and is not produced by any workflow here.`,
          "Correct the path, or add the workflow that produces it. An agent pointed at a document that will never exist fails when someone clicks the card."));
    });
  }

  /* criteria */
  criteria.forEach((c, i) => {
    const row = i + 2;
    if (!knownWorkflows.has(c.workflow))
      add("criteria.csv", row, `A criterion belongs to workflow '${c.workflow}', which is not in this import.`,
        "Add the workflow to workflows.csv.");
    if (!CRITERION_KINDS.includes(c.kind))
      add("criteria.csv", row, `Criterion for '${c.workflow}' has kind '${c.kind}'.`, `Use one of: ${CRITERION_KINDS.join(", ")}.`);
    if (c.stepOrd !== null && !steps.some((s) => s.workflow === c.workflow && s.ord === c.stepOrd))
      add("criteria.csv", row, `Criterion names step ${c.stepOrd} of '${c.workflow}', which has no such step.`,
        "Leave the ord column empty for a workflow-level criterion, or point at a step that exists.");

    const parts = [c.subjectKind, c.subjectRef, c.operator, c.value];
    const filled = parts.filter(Boolean).length;
    if (filled > 0 && filled < 4)
      add("criteria.csv", row, `Criterion for '${c.workflow}' is half-specified — ${filled} of subject_kind, subject_ref, operator, value.`,
        "Give all four, or none. A half-specified check never evaluates, and a check that never evaluates reads as satisfied.");
    if (filled === 0 && !c.text)
      add("criteria.csv", row, `Criterion for '${c.workflow}' has neither a check nor any text.`,
        "A judgment criterion must at least say what is being judged.");
  });

  if (problems.length > 0) return { ok: false, problems };

  /* ── nothing is wrong; work out what changes ───────────────────────────── */

  const plan: Plan = {
    workstreams: workstreams.map((row) => ({
      action: existing.workstreams.includes(row.code) ? "unchanged" : "create", row,
    })),
    roles: roles.map((row) => ({
      action: existing.roles.includes(row.code) ? "unchanged" : "create", row,
    })),
    workflows: workflows.map((row) => {
      const mine = steps.filter((s) => s.workflow === row.code).sort((a, b) => a.ord - b.ord);
      const mineC = criteria.filter((c) => c.workflow === row.code);
      const before = existing.workflows.find((w) => w.code === row.code);
      if (!before) return { action: "create" as const, row, steps: mine, criteria: mineC, changes: [] };
      const changes = describeChanges(before, mine, mineC);
      return {
        action: changes.length ? ("new-version" as const) : ("unchanged" as const),
        row, steps: mine, criteria: mineC, changes,
      };
    }),
  };

  const n = (as: { action: string }[], a: string) => as.filter((x) => x.action === a).length;
  const summary = [
    `${n(plan.workstreams, "create")} new workstream(s)`,
    `${n(plan.roles, "create")} new role(s)`,
    `${n(plan.workflows, "create")} new workflow(s)`,
    `${n(plan.workflows, "new-version")} workflow(s) gaining a version`,
  ].join(" · ");

  return { ok: true, plan, summary };
}

/** A human-readable diff, for the confirmation screen. Silence means nothing changed. */
function describeChanges(
  before: { steps: StepRow[]; criteria: CriterionRow[] },
  steps: StepRow[],
  criteria: CriterionRow[],
): string[] {
  const out: string[] = [];
  // EVERY field a step carries. When `nests` and `title` were added and this key was not, a row
  // could change which workflow it nests and the importer would report "unchanged" — a diff that
  // does not compare everything is a diff that lies. Adding a column means adding it here.
  const key = (s: StepRow) =>
    `${s.ord}:${s.kind}:${s.role}:${s.task}:${s.produces}:${s.reads.join("|")}:${s.conditional}:${s.nests}:${s.title}:${s.dependsOn.join("|")}`;
  const ckey = (c: CriterionRow) =>
    `${c.stepOrd ?? "-"}:${c.kind}:${c.text}:${c.subjectKind}:${c.subjectRef}:${c.operator}:${c.value}`;

  const wasSteps = new Set(before.steps.map(key));
  const nowSteps = new Set(steps.map(key));
  const addedSteps = steps.filter((s) => !wasSteps.has(key(s)));
  const goneSteps = before.steps.filter((s) => !nowSteps.has(key(s)));
  if (addedSteps.length) out.push(`${addedSteps.length} step(s) added or amended`);
  if (goneSteps.length) out.push(`${goneSteps.length} step(s) removed or replaced`);

  const wasC = new Set(before.criteria.map(ckey));
  const nowC = new Set(criteria.map(ckey));
  const addedC = criteria.filter((c) => !wasC.has(ckey(c)));
  const goneC = before.criteria.filter((c) => !nowC.has(ckey(c)));
  if (addedC.length) out.push(`${addedC.length} criterion/criteria added or amended`);
  if (goneC.length) out.push(`${goneC.length} criterion/criteria removed`);

  return out;
}
