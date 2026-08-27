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
  reads: string[]; conditional: string;
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

/**
 * Fill in `reads` from `dependsOn`.
 *
 * DIRECT dependencies only, deliberately. The transitive closure would hand kickoff every document
 * the phase ever produced, which is not what "reads" means and would bury the two inputs that
 * matter. If a row needs the SOW as well as the brief, it declares both — and then the edge and
 * the input are the same statement, which is the whole point.
 *
 * The authored `reads` survives alongside, holding only paths no step here produces. Those are
 * real: `sprint` reads the delivery plan and the deliverables from `sprint-0`, and no dependency
 * inside `sprint` could ever supply them.
 *
 * Order is dependency order, then the external ones, so a prompt's inputs read the way the graph
 * runs rather than the way the CSV happened to be typed.
 */
export function deriveReads(steps: StepRow[]): StepRow[] {
  const producerOf = new Map<string, Map<string, string>>();   // workflow → task → produces
  for (const s of steps) {
    if (!s.produces) continue;
    const m = producerOf.get(s.workflow) ?? new Map();
    m.set(s.task, s.produces);
    producerOf.set(s.workflow, m);
  }

  return steps.map((s) => {
    const mine = producerOf.get(s.workflow) ?? new Map<string, string>();
    const produced = new Set(mine.values());
    const fromDeps = s.dependsOn.map((d) => mine.get(d)).filter((p): p is string => Boolean(p));
    // Anything the author listed that no step here produces — the genuinely external input. A
    // listed path that IS produced here is not silently dropped; `problems` rejects it, because
    // it means the author stated an edge in the column that no longer carries one.
    const external = s.reads.filter((r) => !produced.has(r));
    return { ...s, reads: [...new Set([...fromDeps, ...external])] };
  });
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
  workflows.forEach((w) => {
    const here = authored.filter((s) => s.workflow === w.code && s.produces);
    const by = new Map<string, string[]>();
    here.forEach((s) => by.set(s.produces, [...(by.get(s.produces) ?? []), s.task]));
    for (const [path, tasks] of by) {
      if (tasks.length > 1)
        add("workflow-steps.csv", null,
          `Workflow '${w.code}' has ${tasks.length} steps producing '${path}': ${tasks.join(", ")}.`,
          "Give each row its own path, or merge them into one row. Two rows writing one document means the later one supersedes the earlier with nothing recording that it did.");
    }
  });

  // `reads` is derived from `depends_on` for anything produced inside the workflow, so listing
  // such a path in the column states an edge that the column no longer carries. Refused rather
  // than ignored: silently dropping it would leave the author believing the input is pinned.
  authored.forEach((s, i) => {
    const producedHere = new Map(
      authored.filter((x) => x.workflow === s.workflow && x.produces).map((x) => [x.produces, x.task]),
    );
    s.reads.forEach((r) => {
      const by = producedHere.get(r);
      if (by && by !== s.task)
        add("workflow-steps.csv", i + 2,
          `Step ${s.workflow}/${s.ord} reads '${r}', which '${by}' produces in the same workflow.`,
          `Remove it from \`reads\` and put \`${by}\` in \`depends_on\`. A row reads what it depends on — stating both is how the two drifted apart.`);
    });
  });

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
    const namedStep = c.stepOrd === null
      ? null
      : steps.find((s) => s.workflow === c.workflow && s.ord === c.stepOrd) ?? null;

    if (c.stepOrd !== null && !namedStep)
      add("criteria.csv", row, `Criterion names step ${c.stepOrd} of '${c.workflow}', which has no such step.`,
        "Leave the ord column empty for a workflow-level criterion, or point at a step that exists.");

    // A document check must name the document ITS OWN STEP promises.
    //
    // Criteria bind to a step by ORDINAL, so renumbering the steps silently slides every criterion
    // onto a different row. Checking only that the ord EXISTS cannot see that: a permuted ord names
    // a real step, so the import passes and the drift surfaces on a live board. Sprint-0 shipped
    // with five of these when it absorbed pre-sprint-0 — the timeline row asked for the product
    // brief, the staffing row asked for the timeline, and the sprint-plan row checked the delivery
    // plan, which a DIFFERENT row publishes.
    //
    // Both directions of failure are bad and they do not look alike. A row pointed at a document
    // nobody produces can never close. A row pointed at a document some OTHER row produces closes
    // on that row's work — a false green, which is worse, because it is indistinguishable from the
    // deliverable actually existing.
    //
    // Only the produces-bearing case is checked. A step that promises nothing has nothing to
    // contradict, and a criterion may legitimately read a document from an earlier phase.
    if (namedStep && c.subjectKind === "document" && namedStep.produces
        && c.subjectRef !== namedStep.produces) {
      const producer = steps.find((s) => s.workflow === c.workflow && s.produces === c.subjectRef);
      add("criteria.csv", row,
        `Step ${c.stepOrd} of '${c.workflow}' (${namedStep.task}) produces '${namedStep.produces}', ` +
        `but its criterion checks '${c.subjectRef}'` +
        (producer ? ` — which step ${producer.ord} (${producer.task}) produces.` : " — which no step here produces."),
        producer
          ? `Point the criterion at '${namedStep.produces}', or move it to step ${producer.ord}. As written this row closes on another row's work.`
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
