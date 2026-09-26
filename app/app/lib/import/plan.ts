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
import { destinationOf } from "../adapters";
import type { Refusal } from "../envelope";

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
  ownerRole: string; trigger: string; enabled: boolean; repeatable: boolean;
  /**
   * The workflow's INTERFACE — what it must be given, and what it promises back.
   *
   * Declared once here rather than restated on every row that nests it. It was restated, and it
   * drifted: three of nine nesting rows ended up with no gate at all, so they closed on whatever
   * the child happened to do. `deriveCriteria` turns these into that row's gates instead.
   *
   * Same document vocabulary as `produces` and the criteria — `SOW`, `product-brief`,
   * `deliverables@tickets` — so `destinationOf` strips the slot and the document evaluator
   * resolves `{epic}` exactly as it does everywhere else.
   */
  inputs: string[];
  outputs: string[];
};
export type StepRow = {
  workflow: string; ord: number; kind: string; role: string; task: string;
  produces: string;
  /**
   * What this step reads — DERIVED, not authored, for anything produced inside the same workflow.
   *
   * `reads` and `depends_on` were two hand-written statements of one fact, and they drifted: eight
   * of sprint-0's thirteen rows read a document whose producer was not upstream of them, so the
   * foundation architecture could start with no product brief and kickoff with no delivery plan.
   * Nothing was wrong with either column on its own; keeping them in agreement was the job nobody
   * could do reliably.
   *
   * So depending on a row now MEANS consuming what it produces. `deriveReads` fills this in from
   * `dependsOn`, and the CSV's `reads` column carries only what no step in the workflow produces —
   * a document from another workflow, or one a human supplied. Two of twenty-one reads across the
   * whole seed are of that kind.
   */
  /**
   * What kind of thing this step makes, from the closed set the app implements — or empty for an
   * ordinary document, which is most rows. This is what `tools.ts` and `materialise.ts` key on.
   * They used to key on `produces`, and a path is a value the author renames: doing so made both
   * lookups miss and the step silently stopped creating tickets while still passing its gates.
   */
  output: string;
  reads: string[]; conditional: string;
  /** `kind: workflow` only — the workflow this row nests. The row is done when that run closes. */
  nests: string;
  /** What a person calls this row. The queue showed `propose-kickoff-backlog` without it. */
  title: string;
  /**
   * The shape the deliverable must arrive in — a `document_template` NAME, or empty for free-form.
   *
   * A NAME, not a path and not the body. The templates are 140–293 lines of markdown with tables,
   * which inside a CSV cell would make this file unreadable and churn a step row on every template
   * edit; and `produces` cannot find the file by convention, since `product-brief` lives in
   * `brief.md` and `foundational-architecture` in `foundation-architecture.md`.
   *
   * Empty is legitimate — not every deliverable has a house shape. A name that resolves to nothing
   * is not: `run.ts` halts rather than letting the model invent a structure, because a document
   * that looks finished and is not the deliverable asked for is indistinguishable from success.
   *
   * ONLY ROWS THAT AUTHOR. A row that RECEIVES a document must leave this empty — `file-sow` and
   * `file-requirements`, sprint-0's first two rows, are both of that kind and both have it blank.
   * They are the case that makes the distinction: the client's SOW and their requirements are
   * pasted or linked as an answer, filed verbatim by `fileAnswer` as a single "As supplied"
   * section. Two things follow. The floor would
   * never run on it — `fileAnswer` calls `file_document` directly and never passes through
   * `runAgent` — so the row would advertise a shape its own path cannot produce. And on the runs
   * where the agent drafts instead of asking, the floor WOULD run, and would push a signed contract
   * into Compass's section list, which is rewriting a document that is not ours to rewrite.
   *
   * A template still has a use for such a row, but a different one: read the supplied document
   * against it and report what is missing. That is a checklist, not a floor, and it is not this
   * column.
   */
  template: string;
  /**
   * Task slugs of rows this one derives from, in the same workflow — by SLUG, not ord, so a
   * delivery manager reordering rows while reviewing the plan does not silently re-point every
   * edge. The database enforces that each names a row ABOVE this one, which makes a cycle
   * impossible to write rather than something to detect.
   */
  dependsOn: string[];
  /**
   * What panel the job page mounts beside the conversation, from a closed set. EXPLICIT, never
   * inferred — a step used to be read as a review only because its own `produces` happened to be
   * empty, which made "no document" and "this step reviews someone else's document" the same
   * signal, and the second case rendered as neither the document nor the approval panel.
   *
   * `doc` / `code` — this step authors the thing, editable. `doc-review` / `code-review` — it
   * reads someone else's, read-only with a place to comment. `none` — no panel (a machine check,
   * or a `workflow` row whose UI is the nested run, not a document).
   */
  renders: string;
};
export type CriterionRow = {
  workflow: string;
  /**
   * The task slug of the row this criterion belongs to — by SLUG, not ord, for the same reason
   * `dependsOn` is. Null means the criterion belongs to the workflow as a whole.
   */
  stepTask: string | null;
  kind: string; text: string;
  subjectKind: string; subjectRef: string; operator: string; value: string;
  /**
   * Derived from the nested workflow's interface rather than written in criteria.csv.
   *
   * Kept apart so a re-import can replace what it generated without touching a hand-written row,
   * and so the task page can say where a gate came from. Absent means authored.
   */
  generated?: boolean;
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

/**
 * An import refusal: a `Refusal` with every locating field filled, because a planner that knows the
 * file and row should never leave them for the reader to find. Assignable to `Refusal`, so the route
 * sends these through the shared envelope unchanged.
 */
export type Problem = Required<Refusal>;

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
  /**
   * In the database, absent from this bundle. Retired rather than deleted — see
   * `20260101004300_role_enabled.sql` for why a delete breaks history that still resolves.
   *
   * Surfaced separately and never applied silently: a typo'd `code` column looks exactly like a
   * deliberate retirement, and the difference is only visible to the person who wrote the CSV.
   */
  retire: { kind: "role" | "workflow"; code: string; label: string }[];
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
/**
 * What a step can declare it makes. CLOSED, and each value points at code that exists:
 * `roster` parses the approved table into member rows, `backlog` unlocks the backlog tool and
 * creates the issues on approval, `sprint` the same for a sprint plan. Empty is an ordinary
 * document. A fifth value means writing the behaviour first — refusing an unknown one here is
 * what stops a typo falling through to "ordinary document", which is how the old path-matching
 * failed and said nothing.
 */
// Moves in the SAME commit as the database's `workflow_step_output_known`. Adding `code` to only
// one of these made the dry run green and the apply a 500, after `applyPlan` had already published
// the new version — leaving `build` with zero steps. See migration 060's header.
const STEP_OUTPUTS = ["roster", "backlog", "sprint", "code", "supplied"];
// CLOSED, and required on every row — see `StepRow.renders`. Not inferred from `produces`/`kind`
// because the app must not guess which panel a row wants; a row says so.
const RENDERS = ["doc", "code", "doc-review", "code-review", "none"];
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
    // Absent reads false: a workflow that does not say it repeats does not repeat. The default has
    // to be the safe direction — a phase wrongly marked repeatable offers to start a second run of
    // work that is already done.
    repeatable: parseBool(r.repeatable),
    inputs: parseList(r.inputs), outputs: parseList(r.outputs),
  }));
}

function readSteps(csv: string): StepRow[] {
  return parseRecords(csv).map((r) => ({
    workflow: r.workflow, ord: num(r.ord), kind: r.kind || "agent", role: r.role ?? "",
    task: r.task ?? "", produces: r.produces ?? "", output: (r.output ?? "").trim(),
    reads: parseList(r.reads),
    conditional: r.conditional ?? "", nests: r.nests ?? "", title: r.title ?? "",
    template: (r.template ?? "").trim(),
    dependsOn: parseList(r.depends_on),
    renders: (r.renders ?? "").trim(),
  }));
}

/**
 * Fill in `reads` from `dependsOn`.
 *
 * DIRECT dependencies only, deliberately. The transitive closure would hand kickoff every document
 * the phase ever produced, which is not what "reads" means and would bury the two inputs that
 * matter. If a row needs the SOW as well as the brief, it declares both — and then the edge and
 * the input are the same statement, which is the whole point.
 *
 * The authored `reads` survives alongside, and it is ADDITIVE — whatever the author lists is kept,
 * whether or not a step in this workflow also produces it. Deriving covers the common case so the
 * edge and the input stay one statement; the column is how an author says "this row also needs X"
 * without inventing a dependency that does not exist.
 *
 * It did not always work that way: a read naming something a sibling produced was refused, on the
 * grounds that `depends_on` should carry it instead. That conflated two different things. A
 * dependency is an ORDERING — this row waits for that one — and a read is an INPUT. A row may
 * legitimately need a document without waiting on the row that files it, and forcing the author to
 * state the ordering to get the input made the graph say something it did not mean.
 *
 * Order is dependency order first, then anything additional the author listed, so a prompt's inputs
 * read the way the graph runs rather than the way the CSV happened to be typed. Deduped, so listing
 * a path the dependency already supplies is harmless rather than an error.
 */
export function deriveReads(steps: StepRow[]): StepRow[] {
  // The PATH a step produces, never the decorated `produces` string. A step may name where its
  // deliverable goes (`02-scope/deliverables@tickets`) and that suffix is routing — it belongs to
  // the producer alone. Copied into a dependent's `reads` it would become a path no document ever
  // has, and the agent downstream would be told it reads something that does not exist.
  const producerOf = new Map<string, Map<string, string>>();   // workflow → task → path
  for (const s of steps) {
    const path = destinationOf(s.produces)?.path;
    if (!path) continue;
    const m = producerOf.get(s.workflow) ?? new Map();
    m.set(s.task, path);
    producerOf.set(s.workflow, m);
  }

  return steps.map((s) => {
    const mine = producerOf.get(s.workflow) ?? new Map<string, string>();
    const fromDeps = s.dependsOn.map((d) => mine.get(d)).filter((p): p is string => Boolean(p));
    // Everything the author listed, kept as a PATH for the same reason `fromDeps` is one: a read
    // decorated with its routing slot (`deliverables@tickets`) names a path no document ever has,
    // and the agent would be told it reads something that does not exist.
    const authored = s.reads.map((r) => destinationOf(r)?.path ?? r);
    return { ...s, reads: [...new Set([...fromDeps, ...authored])] };
  });
}

function readCriteria(csv: string): CriterionRow[] {
  return parseRecords(csv).map((r) => ({
    // `?? ""` matters: a CSV with no `task` column at all reads undefined, and undefined is not
    // null — it would survive into the row and compare unequal to every step slug, so every
    // criterion would be refused with the useless message "names task 'undefined'". Absent and
    // empty both mean the same thing: this criterion belongs to the workflow, not to a row.
    workflow: r.workflow, stepTask: (r.task ?? "") === "" ? null : r.task, kind: r.kind,
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
  // Authored first, then derived. The checks below run against the AUTHORED rows — a problem must
  // name what someone typed, not what the importer worked out from it.
  const authored = readSteps(bundle.steps ?? "");
  const steps = deriveReads(authored);
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

    // A promise the steps do not keep. `outputs` becomes the gate on every row that nests this
    // workflow, so an output nothing produces is a gate that can never pass — and one that is
    // produced but not declared is a gate the parent never gets.
    const producedBy = new Set(
      steps.filter((s) => s.workflow === w.code && s.produces)
        .map((s) => destinationOf(s.produces)?.path ?? s.produces),
    );
    w.outputs.forEach((o) => {
      const path = destinationOf(o)?.path ?? o;
      if (!producedBy.has(path))
        add("workflows.csv", row,
          `Workflow '${w.code}' declares output '${o}', which none of its steps produces.`,
          `Produce it from a step, or remove it. Every row that nests '${w.code}' is gated on this ` +
          `document existing, and no step writes it.`);
    });
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
    if (s.output && !STEP_OUTPUTS.includes(s.output))
      add("workflow-steps.csv", row, `Step ${s.workflow}/${s.ord} declares output '${s.output}'.`,
        `Use one of: ${STEP_OUTPUTS.join(", ")} — or leave it empty for an ordinary document. A value ` +
        `the app has no behaviour for is a row that promises something nothing does.`);
    // A floor is a shape for something you AUTHOR. A supplied row receives its deliverable and
    // cannot draft at all, so a template on one is a promise nothing can keep — and it would sit
    // there looking like configuration that does something.
    if (s.output === "supplied" && s.template)
      add("workflow-steps.csv", row,
        `Step ${s.workflow}/${s.ord} is \`output: supplied\` and also declares template '${s.template}'.`,
        "A supplied deliverable is filed verbatim as it was given, so there is no drafting for a " +
        "template to shape. Drop the template, or drop `supplied` if this row really does author.");
    if (s.role && !knownRoles.has(s.role))
      add("workflow-steps.csv", row, `Step ${s.workflow}/${s.ord} names role '${s.role}', which does not exist.`,
        "Add it to roles.csv, or correct the spelling.");
    // Optional, like `output` and `template` — most fixtures and older rows have none, and an
    // empty `renders` simply means no panel, same as before this column existed. What must never
    // happen is a VALUE the app has no panel for, or one that contradicts `produces`/`depends_on`.
    if (s.renders && !RENDERS.includes(s.renders))
      add("workflow-steps.csv", row, `Step ${s.workflow}/${s.ord} declares renders '${s.renders}'.`,
        `Use one of: ${RENDERS.join(", ")}. A value the app has no panel for is a row that promises ` +
        `a screen nothing draws.`);
    if ((s.renders === "doc-review" || s.renders === "code-review") && s.dependsOn.length !== 1)
      add("workflow-steps.csv", row,
        `Step ${s.workflow}/${s.ord} renders '${s.renders}' but names ${s.dependsOn.length} ` +
        `dependenc${s.dependsOn.length === 1 ? "y" : "ies"} in depends_on.`,
        "A review renders the ONE document or change it gates — name exactly one dependency in " +
        "depends_on, the row that authors what this one reviews.");
    if ((s.renders === "doc" || s.renders === "code") && !s.produces && s.kind !== "workflow")
      add("workflow-steps.csv", row,
        `Step ${s.workflow}/${s.ord} renders '${s.renders}' but declares no produces.`,
        "A row that authors something names what it produces, or it renders 'none' (or 'doc-review'/" +
        "'code-review' if it is reviewing someone else's).");
    if ((s.renders === "doc-review" || s.renders === "code-review") && s.produces)
      add("workflow-steps.csv", row,
        `Step ${s.workflow}/${s.ord} renders '${s.renders}' and also declares produces '${s.produces}'.`,
        "A review reads the document its dependency produced — it does not author its own. Clear " +
        "produces, or change renders to 'doc'/'code' if this row really does author.");
  });
  workflows.forEach((w) => {
    const ords = steps.filter((s) => s.workflow === w.code).map((s) => s.ord);
    dupes(ords).forEach((o) =>
      add("workflow-steps.csv", null, `Workflow '${w.code}' has two steps numbered ${o}.`, "Step numbers order the graph and must be unique."));
  });

  // The dependency graph, checked HERE and not only at COMMIT.
  //
  // `workflow_step_depends_backward` already refuses both of these, and it is the real guarantee —
  // it fires on every write, including ones that never came through this planner. But it surfaces
  // as a failed transaction with no file and no row, and the promise of this importer is that a
  // refusal names the line and the one next move. Both checks are stated twice on purpose.
  //
  // A dangling slug is the dangerous one: `start_task` resolves dependencies by joining on them,
  // so a slug matching no row yields no rows, `v_waiting` comes back null, and the gate opens. A
  // dependency on a step that does not exist reads exactly like a dependency that is satisfied.
  authored.forEach((s, i) => {
    const siblings = authored.filter((x) => x.workflow === s.workflow);
    const ordOf = new Map(siblings.map((x) => [x.task, x.ord]));
    s.dependsOn.forEach((d) => {
      const at = ordOf.get(d);
      if (at === undefined)
        add("workflow-steps.csv", i + 2,
          `Step ${s.workflow}/${s.ord} depends on '${d}', which is not a row in that workflow.`,
          "Correct the slug, or add the row. A dependency naming nothing is not refused at run time — it is silently satisfied, and the gate opens.");
      else if (at >= s.ord)
        add("workflow-steps.csv", i + 2,
          `Step ${s.workflow}/${s.ord} depends on '${d}' at ord ${at}, which is not above it.`,
          "Dependencies point backwards, which is what makes a cycle impossible to write. Renumber the rows so the producer comes first.");
    });

    // A review's shape must match what it reviews — a `code-review` reading a document, or a
    // `doc-review` reading a change, is a panel that renders the wrong thing for what the
    // dependency actually filed.
    if (s.renders === "doc-review" || s.renders === "code-review") {
      const dep = siblings.find((x) => x.task === s.dependsOn[0]);
      if (dep) {
        const wantCode = s.renders === "code-review";
        if (wantCode !== (dep.output === "code"))
          add("workflow-steps.csv", i + 2,
            `Step ${s.workflow}/${s.ord} renders '${s.renders}' but depends on '${dep.task}', whose ` +
            `output is ${dep.output ? `'${dep.output}'` : "an ordinary document"}.`,
            wantCode
              ? "code-review reviews a change — the dependency should declare output 'code'."
              : "doc-review reviews a document — the dependency should not declare output 'code'.");
      }
    }
  });

  // A slug that names two rows.
  //
  // `depends_on` addresses rows BY SLUG, so a repeated slug makes "the row this depends on" a
  // question with two answers — and the trigger's lookup takes whichever the planner happens to
  // return. Not policed unconditionally, because repetition is currently harmless and common:
  // four workflows have two or three `approve` rows, none produces anything, and nothing points at
  // them. Flagged only where it decides something — a slug someone depends on, or duplicates that
  // produce different documents.
  workflows.forEach((w) => {
    const here = authored.filter((s) => s.workflow === w.code);
    const dependedOn = new Set(here.flatMap((s) => s.dependsOn));
    const byTask = new Map<string, StepRow[]>();
    here.forEach((s) => byTask.set(s.task, [...(byTask.get(s.task) ?? []), s]));
    for (const [task, group] of byTask) {
      if (group.length < 2 || !task) continue;
      const outputs = new Set(group.map((s) => s.produces).filter(Boolean));
      if (!dependedOn.has(task) && outputs.size < 2) continue;
      add("workflow-steps.csv", null,
        `Workflow '${w.code}' has ${group.length} rows named '${task}' (ords ${group.map((s) => s.ord).join(", ")}).`,
        "A dependency names a row by its slug, so the slug has to identify one row. Give them distinct names, e.g. approve-brief and approve-design.");
    }
  });

  // Two rows producing one path. Ambiguous before this change and load-bearing after it: "the step
  // that produces X" has to be a single row for a dependency to mean anything. sprint-0 had
  // `tailor-delivery-plan` and `draft-sprint-plan` both writing `03-delivery/plan` on parallel
  // branches, so whichever finished last silently superseded the other — and `sprint`'s entry gate
  // names that path, which made the next phase's readiness depend on branch timing.
  //
  // `@scm` IS THE EXCEPTION, and it is the opposite case rather than a loophole. Several rows
  // sharing one document means the last writer wins silently. Several rows sharing one BRANCH is
  // what a build is: implement, add the tests, review, answer the review — four steps contributing
  // to one branch and one pull request, in order, each seeing the last one's work. Nothing is
  // superseded, which is the whole reason the rule exists.
  workflows.forEach((w) => {
    const here = authored.filter(
      (s) => s.workflow === w.code && s.produces && destinationOf(s.produces)?.slot !== "scm",
    );
    const by = new Map<string, string[]>();
    here.forEach((s) => by.set(s.produces, [...(by.get(s.produces) ?? []), s.task]));
    for (const [path, tasks] of by) {
      if (tasks.length > 1)
        add("workflow-steps.csv", null,
          `Workflow '${w.code}' has ${tasks.length} steps producing '${path}': ${tasks.join(", ")}.`,
          "Give each row its own path, or merge them into one row. Two rows writing one document means the later one supersedes the earlier with nothing recording that it did.");
    }
  });

  // NO CHECK HERE that a read names something no sibling produces. `reads` is additive on top of
  // what `depends_on` derives — see `deriveReads`. Reading a document a sibling files, without
  // waiting on that sibling, is a thing an author is allowed to say.
  //
  // What still polices reads is the existence check below: the path has to be one some workflow
  // produces or one the engagement already has. That is the check that catches a typo, and it is
  // the one worth keeping.

  // A step can only read a document that exists, or one an earlier workflow produces. Anything
  // else is a job whose agent is pointed at nothing — and it fails at RUN time, in front of
  // whoever clicked it, rather than at import.
  //
  // This check exists because the first seed read `02-scope-sow/sow-source.md` while the real
  // tree had `02-scope/sow`. Nothing caught it: the criteria that would have are not evaluated
  // yet, and a plausible-looking path is invisible by eye.
  //
  // Run against the DERIVED reads, which is the set an agent will actually be handed. Everything
  // derived from a dependency is produced here by construction, so in practice this now polices
  // exactly the external paths — the ones nothing else can vouch for.
  const produced = new Set(
    steps.map((s) => destinationOf(s.produces)?.path).filter(Boolean) as string[],
  );
  if (existing.documents.length > 0) {
    const known = new Set([...existing.documents, ...produced]);
    steps.forEach((s, i) => {
      s.reads.filter((r) => !known.has(r)).forEach((r) =>
        add("workflow-steps.csv", i + 2,
          `Step ${s.workflow}/${s.ord} reads '${r}', which is not a document on this engagement and is not produced by any workflow here.`,
          "Correct the path, or add the workflow that produces it. An agent pointed at a document that will never exist fails when someone clicks the card."));
    });

    // The same check for a workflow's declared inputs. An input becomes a READY criterion on every
    // row that nests it, so one naming a document nothing will ever create is a row that can never
    // start — and the person sees that when they click it, not here.
    workflows.forEach((w, i) => {
      w.inputs.filter((r) => !known.has(destinationOf(r)?.path ?? r)).forEach((r) =>
        add("workflows.csv", i + 2,
          `Workflow '${w.code}' declares input '${r}', which is not a document on this engagement and is not produced by any workflow here.`,
          "Correct the path, or add the workflow that produces it. Every row nesting this one is gated on it."));
    });
  }

  // A nested workflow with no declared outputs. The row that nests it would close on nothing but
  // the child run ending — which is exactly the state three rows were in before this column existed.
  const nested = new Set(steps.filter((s) => s.kind === "workflow" && s.nests).map((s) => s.nests));
  workflows.forEach((w, i) => {
    if (nested.has(w.code) && !w.outputs.length)
      add("workflows.csv", i + 2,
        `Workflow '${w.code}' is nested by another workflow but declares no outputs.`,
        "List what it produces for its caller, e.g. outputs=product-brief. Without it the row that " +
        "nests it closes whenever the child run ends, whatever the child actually produced.");
  });

  /* criteria */
  criteria.forEach((c, i) => {
    const row = i + 2;
    if (!knownWorkflows.has(c.workflow))
      add("criteria.csv", row, `A criterion belongs to workflow '${c.workflow}', which is not in this import.`,
        "Add the workflow to workflows.csv.");
    if (!CRITERION_KINDS.includes(c.kind))
      add("criteria.csv", row, `Criterion for '${c.workflow}' has kind '${c.kind}'.`, `Use one of: ${CRITERION_KINDS.join(", ")}.`);
    const namedStep = c.stepTask === null
      ? null
      : steps.find((s) => s.workflow === c.workflow && s.task === c.stepTask) ?? null;

    if (c.stepTask !== null && !namedStep)
      add("criteria.csv", row, `Criterion names task '${c.stepTask}' of '${c.workflow}', which has no such row.`,
        "Leave the task column empty for a workflow-level criterion, or name a row that exists.");

    // A document check must name the document ITS OWN STEP promises.
    //
    // Slug binding stops a criterion sliding onto another row when the steps are renumbered, which
    // is how sprint-0 broke. It does NOT stop a criterion being pointed at the wrong document in
    // the first place, and the two failures do not look alike. A row pointed at a document nobody
    // produces can never close. A row pointed at a document some OTHER row produces closes on that
    // row's work — a false green, which is worse, because it is indistinguishable from the
    // deliverable actually existing. Sprint-0 shipped one of each.
    //
    // Only the produces-bearing case is checked. A step that promises nothing has nothing to
    // contradict, and a criterion may legitimately read a document from an earlier phase.
    // Compared as PATHS. A criterion names a document; `produces` may also name where that document
    // goes (`…@tickets`), and comparing the decorated string would refuse every routed step for
    // disagreeing with itself.
    const producesPath = destinationOf(namedStep?.produces)?.path;
    if (namedStep && c.subjectKind === "document" && producesPath
        && c.subjectRef !== producesPath) {
      const producer = steps.find(
        (s) => s.workflow === c.workflow && destinationOf(s.produces)?.path === c.subjectRef,
      );
      add("criteria.csv", row,
        `Row '${c.stepTask}' of '${c.workflow}' produces '${producesPath}', ` +
        `but its criterion checks '${c.subjectRef}'` +
        (producer ? ` — which '${producer.task}' produces.` : " — which no row here produces."),
        producer
          ? `Point the criterion at '${namedStep.produces}', or move it to '${producer.task}'. As written this row closes on another row's work.`
          : `Point the criterion at '${namedStep.produces}'. As written this row can never close.`);
    }

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

  // Authored criteria, then the gates each nesting row inherits from the workflow it nests. Built
  // here rather than at write time so the dry run shows them, and so `describeChanges` counts them
  // — a contract that changes is a new version of the workflow, exactly like an edited step.
  const allCriteria = [...criteria, ...deriveCriteria(workflows, roles, steps, criteria)];

  const plan: Plan = {
    workstreams: workstreams.map((row) => ({
      action: existing.workstreams.includes(row.code) ? "unchanged" : "create", row,
    })),
    roles: roles.map((row) => ({
      action: existing.roles.includes(row.code) ? "unchanged" : "create", row,
    })),
    workflows: workflows.map((row) => {
      const mine = steps.filter((s) => s.workflow === row.code).sort((a, b) => a.ord - b.ord);
      const mineC = allCriteria.filter((c) => c.workflow === row.code);
      const before = existing.workflows.find((w) => w.code === row.code);
      if (!before) return { action: "create" as const, row, steps: mine, criteria: mineC, changes: [] };
      const changes = describeChanges(before, mine, mineC);
      return {
        action: changes.length ? ("new-version" as const) : ("unchanged" as const),
        row, steps: mine, criteria: mineC, changes,
      };
    }),
    // What the database has and this bundle does not. The importer upserted and never removed, so a
    // role dropped from the seed lived on and a role RENAMED became two live rows — `pm` beside
    // `product-manager`, both offerable. Naming them here is what makes a rename a rename.
    retire: [
      ...existing.roles
        .filter((code) => !roles.some((r) => r.code === code))
        .map((code) => ({ kind: "role" as const, code, label: code })),
      ...existing.workflows
        .filter((w) => !workflows.some((r) => r.code === w.code))
        .map((w) => ({ kind: "workflow" as const, code: w.code, label: w.code })),
    ],
  };

  const n = (as: { action: string }[], a: string) => as.filter((x) => x.action === a).length;
  const summary = [
    `${n(plan.workstreams, "create")} new workstream(s)`,
    `${n(plan.roles, "create")} new role(s)`,
    `${n(plan.workflows, "create")} new workflow(s)`,
    `${n(plan.workflows, "new-version")} workflow(s) gaining a version`,
    // Last and always stated, including at zero. A retirement is the one action here that takes
    // something away, and it must not be the line that only appears when it is too late to notice.
    `${plan.retire.length} to retire`,
  ].join(" · ");

  return { ok: true, plan, summary };
}

/** A human-readable diff, for the confirmation screen. Silence means nothing changed. */
/**
 * The nearest documents produced upstream of a row, walking THROUGH rows that produce nothing.
 *
 * `deriveReads` stops at the direct dependency, so a review → approve chain resolves to nothing: the
 * reviewer's row produces no document, and the approver is left with no idea what it is approving.
 * Walking on through non-producing rows reaches the draft that started the chain.
 *
 * Stops at the FIRST producer on each path, never accumulating the whole upstream set — a row
 * depending on eleven others must not be gated on everything the workflow ever wrote.
 */
function nearestProduced(
  steps: StepRow[], workflow: string, task: string,
): { path: string; by: StepRow }[] {
  const byTask = new Map(steps.filter((s) => s.workflow === workflow).map((s) => [s.task, s]));
  const out = new Map<string, StepRow>();
  const seen = new Set<string>();

  const walk = (t: string) => {
    if (seen.has(t)) return;                        // a cycle is refused elsewhere; do not hang here
    seen.add(t);
    for (const d of byTask.get(t)?.dependsOn ?? []) {
      const up = byTask.get(d);
      if (!up) continue;
      const path = destinationOf(up.produces)?.path;
      if (path) { if (!out.has(path)) out.set(path, up); continue; }   // stop at the producer
      walk(d);                                                          // produces nothing: keep going
    }
  };
  walk(task);
  return [...out].map(([path, by]) => ({ path, by }));
}

/**
 * Every gate the workflows and their steps already imply.
 *
 * `criteria.csv` used to restate all of this by hand, and 127 of its 226 rows were mechanically
 * implied by the steps beside them. Hand-copying is how they drifted: the steps were renamed to
 * produce `sow` and `timeline` while the criteria went on checking `SOW` and `Milestones and
 * timeline`, and 391 gates pointed at documents nothing would ever write.
 *
 * What is NOT here is the point of the file that remains: "Every milestone has a date and something
 * it delivers" is the content of a review, and no step implies it. Those are authored in
 * criteria.csv and an authored row always wins — generation skips anything already stated.
 *
 * A REVIEW row is a `hitl` row another `hitl` depends on; an APPROVE row is a `hitl` row no `hitl`
 * depends on. That split is structural, not a match on task names, and it reproduces the old corpus
 * exactly: all 23 "accepted by" rows were approve rows, all 6 "found nothing" rows were review rows.
 */
function deriveCriteria(
  workflows: WorkflowRow[], roles: RoleRow[], steps: StepRow[], authored: CriterionRow[],
): CriterionRow[] {
  const byCode = new Map(workflows.map((w) => [w.code, w]));
  const labelOf = new Map(roles.map((r) => [r.code, r.label || r.code]));
  // The path, not the raw value: `deliverables@tickets` is filed at `deliverables`, which is what the
  // document evaluator compares against and what `produces` resolves to.
  const pathOf = (ref: string) => destinationOf(ref)?.path ?? ref;

  // A criterion is identified by what it CHECKS. For a MECHANICAL one that is the subject alone —
  // two rows checking `document timeline status published` are one gate however differently they are
  // worded, and a nesting row that also produces its child's document would otherwise be gated twice
  // on the same fact. A JUDGMENT criterion has no subject, so its words are all it is, and two
  // different sentences are two different things to confirm.
  const key = (c: CriterionRow) =>
    c.subjectKind
      ? `${c.workflow}:${c.stepTask ?? "-"}:${c.kind}:${c.subjectKind}:${c.subjectRef}`
      : `${c.workflow}:${c.stepTask ?? "-"}:${c.kind}::${c.text}`;
  const seen = new Set(authored.map(key));
  const out: CriterionRow[] = [];
  const emit = (c: CriterionRow) => {
    if (seen.has(key(c))) return;
    seen.add(key(c));
    out.push(c);
  };
  const published = (workflow: string, task: string | null, path: string, why: string) => emit({
    workflow, stepTask: task, kind: "done", text: why,
    subjectKind: "document", subjectRef: path, operator: "status", value: "published",
    generated: true,
  });

  /** The ticket checks a produced KIND implies — keyed on `output`, never on a path an author renames. */
  const TICKETS: Record<string, { ref: string; why: string }[]> = {
    code:   [{ ref: "pr-linked", why: "A pull request is linked on the ticket." }],
    sprint: [
      { ref: "committed-have-epic", why: "Every committed story belongs to an epic." },
      { ref: "on-board", why: "Every committed story is on the board with an owner." },
    ],
  };
  const ticketsFor = (workflow: string, task: string, output: string) =>
    (TICKETS[output] ?? []).forEach((t) => emit({
      workflow, stepTask: task, kind: "done", text: t.why,
      subjectKind: "ticket", subjectRef: t.ref, operator: "is", value: "true", generated: true,
    }));

  for (const wf of workflows) {
    const mine = steps.filter((s) => s.workflow === wf.code);
    // A hitl row that another hitl depends on is a review; the last one in the chain approves.
    const hitlDependedOn = new Set(
      mine.filter((s) => s.kind === "hitl").flatMap((s) => s.dependsOn),
    );

    for (const s of mine) {
      /* 1 — a row is gated on the document it files. */
      //
      // A PER-SUBJECT path is gated here too, unlike on the parent at 8 below. The distinction is
      // WHOSE subject fills the placeholder: this row runs inside the run that has one, so
      // `evaluateDocument` resolves `{epic}` through `subjectFor(taskId)` and measures the document
      // that was actually filed. It returns UNMEASURABLE when it cannot resolve, which still
      // refuses the close — so the worst case of gating here is a row that will not close, never a
      // row that closes wrongly. The parent's fan-out row has no subject of its own, which is why
      // that case still skips.
      //
      // Skipping it here was a false green of the exact shape rule 11 names. `tech-design`'s author
      // row produced `03-architecture/epic/{epic}` and got no Done gate at all — it closed over an
      // aggregate of nothing. criteria.csv carried that gate by hand; when the gates became derived
      // the row silently lost it, and `build` and `fix` have been in the same state ever since,
      // every one of their `{subject}@scm` rows ungated.
      const own = destinationOf(s.produces)?.path;
      if (own) {
        published(wf.code, s.task, own, `${own} is published.`);
      }

      /* 3 — what a produced KIND implies on the tracker. */
      if (s.output) ticketsFor(wf.code, s.task, s.output);

      /* 8 — a nesting row inherits the child's contract. */
      if (s.kind === "workflow" && s.nests) {
        const child = byCode.get(s.nests);
        if (child) {
          for (const input of child.inputs) {
            emit({
              workflow: wf.code, stepTask: s.task, kind: "ready",
              text: `${pathOf(input)} is published — ${s.nests} reads it.`,
              subjectKind: "document", subjectRef: pathOf(input),
              operator: "status", value: "published", generated: true,
            });
          }
          for (const output of child.outputs) {
            // A PER-SUBJECT output — `03-architecture/epic/{epic}` — is deliberately not gated on the
            // parent. The placeholder resolves against the task's own subject, and a fan-out row has
            // none: the criterion would be permanently unmeasurable and the row could never close.
            // Each child run gates its own document, and the `nested` check below covers that they ran.
            if (output.includes("{")) continue;
            published(wf.code, s.task, pathOf(output),
              `${pathOf(output)} is published — ${s.nests} produces it.`);
          }
          // What the child's own steps promise the tracker travels up with the deliverable.
          for (const cs of steps.filter((x) => x.workflow === s.nests && x.output)) {
            ticketsFor(wf.code, s.task, cs.output);
          }
          emit({
            workflow: wf.code, stepTask: s.task, kind: "done",
            text: `Every ${s.nests} run this row opened has closed.`,
            subjectKind: "nested", subjectRef: s.nests, operator: "is", value: "closed",
            generated: true,
          });
        }
      }

      if (s.kind !== "hitl") continue;

      const upstream = nearestProduced(steps, wf.code, s.task);
      const isReview = hitlDependedOn.has(s.task);
      const role = labelOf.get(s.role) ?? s.role;

      /* 2 — a person checks a document, so say which one. */
      //
      // Per-subject paths included, for the reason given at 1: `nearestProduced` never leaves this
      // workflow, so every path it returns was filed by a sibling row of the SAME run and resolves
      // against the same subject. A reviewer whose document is per-epic is reviewing an epic.
      for (const { path } of upstream) {
        published(wf.code, s.task, path, `${path} is published.`);
      }

      /* 7 — the reviewer is not the author. Only sayable when there IS an author to differ from. */
      for (const { by } of upstream) {
        if (by.role && s.role && by.role !== s.role) {
          emit({
            workflow: wf.code, stepTask: s.task, kind: "done",
            text: `The ${role} did not write what they are reviewing.`,
            subjectKind: "", subjectRef: "", operator: "", value: "", generated: true,
          });
          break;
        }
      }

      if (isReview) {
        /* 4 — silence is not a review. */
        emit({
          workflow: wf.code, stepTask: s.task, kind: "done",
          text: "A review that found nothing says so explicitly, rather than closing in silence.",
          subjectKind: "", subjectRef: "", operator: "", value: "", generated: true,
        });
      } else {
        /* 6 — an approval answers the review it follows. */
        if (s.dependsOn.some((d) => mine.find((x) => x.task === d)?.kind === "hitl")) {
          emit({
            workflow: wf.code, stepTask: s.task, kind: "done",
            text: "Every finding from the review is answered — accepted, actioned, or overruled with a reason.",
            subjectKind: "", subjectRef: "", operator: "", value: "", generated: true,
          });
        }
        /* 5 — an approval has a name on it. */
        emit({
          workflow: wf.code, stepTask: s.task, kind: "done",
          text: `Accepted by the ${role}, and their name is on the close.`,
          subjectKind: "", subjectRef: "", operator: "", value: "", generated: true,
        });
      }
    }

    /* 9 — the systems of record have to answer before the workflow can start. */
    const reach = [wf.code, ...mine.filter((s) => s.nests).map((s) => s.nests)];
    const touched = steps.filter((s) => reach.includes(s.workflow));
    if (touched.some((s) => destinationOf(s.produces)?.path)) {
      emit({
        workflow: wf.code, stepTask: null, kind: "ready", text: "The doc store answers.",
        subjectKind: "connector", subjectRef: "docs", operator: "is", value: "wired", generated: true,
      });
    }
    if (touched.some((s) => destinationOf(s.produces)?.slot === "tickets"
                         || s.output === "backlog" || s.output === "sprint")) {
      emit({
        workflow: wf.code, stepTask: null, kind: "ready", text: "The tracker answers.",
        subjectKind: "connector", subjectRef: "tickets", operator: "is", value: "wired", generated: true,
      });
    }
  }
  return out;
}

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
    `${s.ord}:${s.kind}:${s.role}:${s.task}:${s.produces}:${s.output}:${s.reads.join("|")}:${s.conditional}:${s.nests}:${s.title}:${s.template}:${s.dependsOn.join("|")}:${s.renders}`;
  const ckey = (c: CriterionRow) =>
    `${c.stepTask ?? "-"}:${c.kind}:${c.text}:${c.subjectKind}:${c.subjectRef}:${c.operator}:${c.value}`;

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
