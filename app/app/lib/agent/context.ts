// What the agent is given: who it is, what it reads, and when it is done.
//
// PINNED AT START, NOT RESOLVED AT READ. When a task starts, the documents its step declares are
// recorded in `task_input` with the exact version that was live at that moment. Everything after
// reads the pin, not the path. Without this a citation means "whatever that document says now",
// which is not provenance — it is a dangling pointer that silently rewrites history every time
// someone edits a source.
//
// A pin can also be MISSING, and that is information rather than an error: the step declares three
// documents and only one has been drafted. The agent is told exactly that, because an agent that
// quietly proceeds on a third of its inputs produces a confident answer built on nothing.

import "server-only";
import { resolveSpec } from "../specs";
import { templateFor } from "../data/templates";
import { describeTemplate } from "../render/template";
import type { ResolvedTemplate } from "../data/templates";
import { destinationOf, resolvePath } from "../adapters";
import { supabaseAdmin, must } from "../supabase";
import { resolveJira, searchIssues } from "../jira";
import { nextSprintNumber, committedJql } from "../data/sprint";
import { holdersOn, type Actor } from "./../data/actor";
import { sortByStep } from "../data/steps";


/**
 * How much of an ask reaches the human at once, and how many rounds it gets.
 *
 * An agent told to "ask everything at once" produced thirteen questions on the first task of a real
 * engagement. Every one was reasonable and the whole was a form to fill in — and several of the
 * thirteen were things the answer to the first three would have settled. The conversation is
 * already replayed on every run, so a later round is asked WITH the earlier answers in hand: the
 * cap is what makes that machinery do something.
 *
 * Bounded in the other direction too. Each round is a model run of minutes plus a human waiting on
 * it, so an unbounded interview is its own way of never producing the deliverable.
 *
 * Here rather than in `run.ts` because the prompt states both numbers to the agent and `run.ts`
 * enforces them. Two copies is how a checker ends up carrying the literal it is policing.
 */
export const ASK_BATCH = 3;
export const ASK_ROUNDS_MAX = 4;

export type PinnedInput = {
  path: string;
  title: string | null;
  version: string | null;
  /** Null when the document has never been drafted — the honest empty. */
  body: string | null;
};

export type AgentContext = {
  taskId: string;
  engagementId: string;
  taskTitle: string;
  taskSubtitle: string;
  roleCode: string;
  agentFile: string | null;
  /**
   * The document path this step produces — the PATH, never the decorated `produces` string.
   *
   * A step may name where its deliverable goes (`02-scope/deliverables@tickets`). That suffix is
   * routing, and it must not travel: `loadPriorDraft` looks a document up by path, the prompt tells
   * the agent what it is producing, and a criterion's `subject_ref` names the same bare path. Left
   * decorated, the prior draft would silently never be found — the agent would rewrite from scratch
   * every run and nothing would say why.
   */
  produces: string | null;
  /**
   * The path this step declares when it names a subject the run does not have — `…/{epic}` on a
   * run opened with no epic. Null whenever `produces` resolved, which is every ordinary step.
   *
   * Carried separately because "this step produces nothing" and "this step's document has nowhere
   * to go" are different failures with the same symptom (`produces === null`), and a halt that
   * reports the wrong one sends whoever reads it to the wrong file.
   */
  unresolvedProduces: string | null;
  /**
   * What panel the job page mounts — see `workflow_step.renders` (migration `step_renders`).
   * `"none"` when the row declares none, which is also what a step imported before this column
   * existed gets: no panel, exactly what it rendered before.
   */
  renders: "doc" | "code" | "doc-review" | "code-review" | "none";
  /**
   * `doc-review`/`code-review` ONLY: the document (or change) this row reviews, resolved from the
   * single `depends_on` row's own `produces`. Null for every other row.
   *
   * DELIBERATELY SEPARATE from `produces` above, not a repurposing of it. `produces` is what
   * `runAgent` files to — `if (!ctx.produces) halt` is the guard that stops a row with nothing to
   * author from filing anything, and a review row's own `produces` IS empty by construction
   * (enforced at import). Pointing `produces` at the reviewed document instead would pass that
   * guard and let running the agent on a REVIEW task silently overwrite the document under
   * review, filed as if the reviewer authored it. `page.tsx` reads `reviewPath` for display only
   * (`draftOf`, `DraftPanel`'s `path`) and `runAgent` never looks at it.
   */
  reviewPath: string | null;
  /**
   * Resolved once here from `actor.capabilities`, not re-derived wherever it is needed — read by
   * `systemPrompt` (to tell the model it actually has this, rather than leaving it to notice the
   * gap between its own agent file's `required_tools: [... web_search ...]` and what it was
   * actually given) and by `run.ts` (to ask the host for it). Most agent files declare `web_search`
   * required; almost none of them had it — this is that gap closing, one role's capability row at
   * a time via `roles.csv`, not a blanket flip for everyone.
   */
  hasWebSearch: boolean;
  /**
   * Where it goes. `docs` publishes a page; `tickets` creates issues on the board; `scm` means the
   * deliverable is a branch and a pull request, and the record belongs on the story in the tracker
   * rather than in a document.
   */
  destination: "docs" | "tickets" | "scm" | null;
  /**
   * What KIND of thing this step makes — `roster`, `backlog`, `sprint`, or null for an ordinary
   * document. What `toolsFor` keys on. It used to key on `produces`, and a path the author renames
   * is not a safe key for behaviour: the rename silently took the tool away and nothing said so.
   */
  output: string | null;
  inputs: PinnedInput[];
  doneCriteria: string[];
  /** What workflows this engagement can actually run. Without it the agent guesses. */
  inventory: WorkflowSummary[];
  /**
   * The other rows of THIS run — what each is for, who holds it, and whether it comes after.
   *
   * `inventory` lists the engagement's WORKFLOWS, which is a different thing: an agent could see
   * that `sprint-0` exists with fourteen steps and not that row 4 is "Staffing plan and resources",
   * owned by the delivery manager. So `file-sow` — which reads nothing and starts from a blank page
   * — asked the human for the team, and `propose-staffing` asked again four rows later.
   *
   * This is the PLAN the agent is part of, not other agents' conversations. Turns stay task-scoped
   * and documents remain the only thing that crosses a row boundary; sharing chatter would cost
   * provenance, the pinned version, and a bounded prompt, for a problem this solves more cheaply.
   */
  phaseRows: PhaseRow[];
  /**
   * The shape the deliverable must arrive in, resolved for this engagement.
   *
   * Null in two very different cases, which is why `templateName` travels beside it: the step
   * declared no template at all (free-form, and most rows are), or it declared one that resolved to
   * nothing. `runAgent` halts on the second and proceeds on the first — a model left to invent its
   * own structure produces a document that looks finished and is not the deliverable the process
   * asked for, and nothing downstream can tell the difference.
   */
  template: ResolvedTemplate | null;
  /** What the step asked for by name, whether or not it resolved. */
  templateName: string | null;
  /** What it produced last time, and what a reviewer said about it. Null on the first run. */
  priorDraft: { version: string; sections: { heading: string; body: string }[] } | null;
  rejections: { criterion: string; reason: string; by: string }[];
  /** Set only on a step that plans a sprint. Null everywhere else. */
  sprint: SprintContext | null;
};

/**
 * What a sprint plan needs that no pinned document can supply.
 *
 * `committable` is asked of the TRACKER, not of Compass. Which stories are already in a sprint is
 * a fact about the board, and a story somebody moved by hand there must not be offered again — the
 * whole reason this feature keeps no sprint table of its own.
 *
 * `reachedTracker` is the honest empty, and it is why `committable` being `[]` is not enough on its
 * own. An agent told "nothing is committed" when the truth is "nobody could look" will happily
 * re-commit a sprint's worth of work that is already in flight.
 */
export type SprintContext = {
  /** Which sprint this is. */
  number: number;
  /** Stories on the board that are not in any earlier sprint. */
  committable: { ref: string; ticketKey: string | null; title: string; epic: string | null }[];
  /** Who is on this engagement, by role — what capacity actually means here. */
  roster: { role: string; holders: string[] }[];
  /** False when the tracker could not be reached, so `committable` is unknown rather than empty. */
  reachedTracker: boolean;
};

export type PhaseRow = {
  ord: number;
  title: string;
  role: string;
  produces: string | null;
  /** After this task's own row. What a later row produces is that row's to gather, not this one's. */
  later: boolean;
};

export type WorkflowSummary = {
  code: string; label: string; workstream: string | null;
  ownerRole: string | null; stepCount: number;
};

/**
 * Record what this task reads, with the versions that were live when it started.
 *
 * Idempotent — re-running pins nothing new. Called from the start path, so a task that never
 * started has no pins, which is correct: nothing was read.
 */
export async function pinInputs(taskId: string, engagementId: string): Promise<number> {
  const sb = supabaseAdmin();
  if (!sb) return 0;

  const { data: task } = await sb.from("work_task")
    .select("workflow_step_id").eq("id", taskId).maybeSingle();
  if (!task?.workflow_step_id) return 0;

  const { data: step } = await sb.from("workflow_step")
    .select("reads").eq("id", task.workflow_step_id).maybeSingle();
  const paths = step?.reads ?? [];
  if (!paths.length) return 0;

  const { data: docs } = await sb.from("document")
    .select("path, current_version_id").eq("engagement_id", engagementId).in("path", paths);

  const versionIds = (docs ?? []).map((d) => d.current_version_id).filter(Boolean) as string[];
  const { data: versions } = versionIds.length
    ? await sb.from("document_version").select("id, version").in("id", versionIds)
    : { data: [] };
  const versionOf = new Map((versions ?? []).map((v) => [v.id, v.version as string]));

  const rows = paths.map((p: string) => {
    const doc = (docs ?? []).find((d) => d.path === p);
    return {
      task_id: taskId,
      document_path: p,
      // Null version = nothing was there to pin. Recorded deliberately: the task read an absence,
      // and later we can tell that apart from never having declared the input at all.
      document_version: doc?.current_version_id ? versionOf.get(doc.current_version_id) ?? null : null,
    };
  });

  const { error } = await sb.from("task_input").upsert(rows, { onConflict: "task_id,document_path" });
  if (error) throw new Error(`pin inputs: ${error.message}`);
  return rows.length;
}


/**
 * The pinned inputs, pinning them first if nobody has.
 *
 * Pinning used to live only inside `startTask`, so an agent invoked by any OTHER route — the job
 * page's Run button, a retry, a script — built its context from zero pins. The prompt then told it
 * "this task declares no input documents", which is a lie when the step declares one, and the agent
 * did the reasonable thing: it asked the human to paste the SOW that Compass had already filed,
 * published and versioned.
 *
 * So the guarantee lives here, where EVERY agent call passes, rather than on one UI path. Pinning is
 * an upsert keyed on (task, path), so a task started normally is unaffected and the versions fixed
 * at start are not moved. Lazy pinning still honours the point of pinning: inputs are fixed at the
 * moment work actually began.
 */
async function ensureInputs(taskId: string, engagementId: string): Promise<PinnedInput[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { count } = await sb.from("task_input")
    .select("*", { count: "exact", head: true }).eq("task_id", taskId);
  if (!count) await pinInputs(taskId, engagementId);
  else await resolveEmptyPins(taskId, engagementId);

  return loadInputs(taskId, engagementId);
}

/**
 * Fill in the pins that had nothing to pin, once something exists.
 *
 * A pin with a null version says the document was not there when work began. That is a fact worth
 * recording — but it must not be permanent, because the whole point of an agent asking for a
 * document is that the document then arrives. Without this, an agent asks for the client's BRD, the
 * human supplies it, it is filed at the declared path, and the next run is still told the input is
 * missing: the answer reaches the record and never reaches the agent.
 *
 * ONLY the null ones. A pin that already names a version is what provenance means — moving it would
 * silently rewrite what a finished draft was derived from, which is the failure pinning exists to
 * prevent. So this resolves absences and never re-resolves a reading.
 */
async function resolveEmptyPins(taskId: string, engagementId: string): Promise<number> {
  const sb = supabaseAdmin();
  if (!sb) return 0;

  const { data: empty } = await sb.from("task_input")
    .select("document_path").eq("task_id", taskId).is("document_version", null);
  if (!empty?.length) return 0;

  const paths = empty.map((p) => p.document_path as string);
  const { data: docs } = await sb.from("document")
    .select("path, current_version_id").eq("engagement_id", engagementId).in("path", paths);

  const versionIds = (docs ?? []).map((d) => d.current_version_id).filter(Boolean) as string[];
  if (!versionIds.length) return 0;

  const { data: versions } = await sb.from("document_version")
    .select("id, version").in("id", versionIds);
  const versionOf = new Map((versions ?? []).map((v) => [v.id, v.version as string]));

  let filled = 0;
  for (const doc of docs ?? []) {
    const version = doc.current_version_id ? versionOf.get(doc.current_version_id) : null;
    if (!version) continue;
    await sb.from("task_input").update({ document_version: version })
      .eq("task_id", taskId).eq("document_path", doc.path).is("document_version", null);
    filled++;
  }
  return filled;
}

/**
 * One document's text, at a named version or at whatever is current.
 *
 * Extracted from `loadInputs` so the ticket composer reads a document the same way an agent turn
 * does — same section ordering, same `## heading` assembly, same honest empty. A second reader
 * written beside this one would drift the moment either changed, and the drift would be invisible:
 * both would return text.
 *
 * `version` omitted means the document's CURRENT version. That is right for a caller with no pin —
 * the composer — and wrong for a task, which must read what it pinned; hence the parameter rather
 * than a default that quietly resolves to now.
 */
export async function loadDocumentText(
  engagementId: string, path: string, version?: string | null,
): Promise<PinnedInput> {
  const sb = supabaseAdmin();
  const absent: PinnedInput = { path, title: null, version: null, body: null };
  if (!sb) return absent;

  const { data: doc } = await sb.from("document")
    .select("id, title, current_version_id").eq("engagement_id", engagementId).eq("path", path).maybeSingle();
  if (!doc) return absent;

  const { data: v } = version
    // The PINNED version, not the current one. This is the whole point of pinning.
    ? await sb.from("document_version")
        .select("id, version").eq("document_id", doc.id).eq("version", version).maybeSingle()
    : doc.current_version_id
      ? await sb.from("document_version")
          .select("id, version").eq("id", doc.current_version_id).maybeSingle()
      : { data: null };

  const { data: sections } = v
    ? await sb.from("document_section").select("heading, body").eq("document_version_id", v.id).order("ord")
    : { data: [] };

  const body = (sections ?? []).map((s) => `## ${s.heading}\n${s.body}`).join("\n\n");
  return { path, title: doc.title, version: v?.version ?? null, body: body || null };
}

/** Load the pinned documents' text, at the pinned version. */
async function loadInputs(taskId: string, engagementId: string): Promise<PinnedInput[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: pins } = await sb.from("task_input")
    .select("document_path, document_version").eq("task_id", taskId).order("document_path");
  if (!pins?.length) return [];

  const out: PinnedInput[] = [];
  for (const pin of pins) {
    // No pinned version means nothing was there to pin. Reported as an absence with whatever title
    // the document has, rather than resolved forward to the current version — a task must not read
    // text that did not exist when it started.
    if (!pin.document_version) {
      const { data: doc } = await sb.from("document")
        .select("title").eq("engagement_id", engagementId).eq("path", pin.document_path).maybeSingle();
      out.push({ path: pin.document_path, title: doc?.title ?? null, version: null, body: null });
      continue;
    }
    out.push(await loadDocumentText(engagementId, pin.document_path, pin.document_version));
  }
  return out;
}

/**
 * The workflows this engagement can run.
 *
 * The agent was writing backlog rows naming workflows it had inferred from whatever its own role
 * file happened to mention in prose — five, all planning ones — and then correctly reporting that
 * those five did not cover build or deploy. Its reasoning was sound and its premise was invented,
 * and it flagged that as its first open question. Nothing in its context listed what actually
 * exists, so this does.
 *
 * A workflow with zero steps is included and says so: the framework has commands whose dispatch
 * graph was never written, and "this exists but its steps are unspecified" is a fact worth having
 * rather than an absence to infer from.
 */
/**
 * What the run this task belongs to is ABOUT, when it is about one thing.
 *
 * Null for every run that covers its whole engagement — which is all of them except the per-epic
 * technical designs, so the common path is one cheap read that returns nothing and changes nothing.
 */
export async function subjectOfRun(
  runId: string | null,
): Promise<{ ref: string | null; key: string | null } | null> {
  if (!runId) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("workflow_run")
    .select("subject_ref, subject_key").eq("id", runId).maybeSingle();
  if (!data?.subject_ref && !data?.subject_key) return null;
  return { ref: data.subject_ref ?? null, key: data.subject_key ?? null };
}

/**
 * The rows of the run this task belongs to.
 *
 * Ordered by the STEP's ord, never `created_at`: a phase writes every row in one transaction, so
 * their timestamps are identical to the millisecond and ordering by them is arbitrary — that is
 * `sortByStep`'s whole reason for existing.
 *
 * Empty for a task with no run, which is a real case rather than an error: the section is then
 * omitted from the prompt entirely.
 */
async function loadPhaseRows(taskId: string, runId: string | null, ownOrd: number): Promise<PhaseRow[]> {
  const sb = supabaseAdmin();
  if (!sb || !runId) return [];

  const { data } = await sb.from("work_task")
    .select("id, title, role_code, workflow_step(ord, produces)")
    .eq("workflow_run_id", runId);

  return sortByStep(data ?? [])
    .filter((r) => r.id !== taskId)
    .map((r) => {
      const step = Array.isArray(r.workflow_step) ? r.workflow_step[0] : r.workflow_step;
      const ord = step?.ord ?? Number.MAX_SAFE_INTEGER;
      return {
        ord,
        title: (r.title as string) ?? "",
        role: (r.role_code as string) ?? "",
        // The bare path: `produces` may name a destination (`…@tickets`) and that suffix is routing,
        // not the document's name.
        produces: destinationOf(step?.produces)?.path ?? null,
        later: ord > ownOrd,
      };
    });
}

async function loadInventory(orgId: string): Promise<WorkflowSummary[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: wfs } = await sb.from("workflow")
    .select("id, code, label, workstream_code, owner_role_code, enabled")
    .eq("org_id", orgId).eq("enabled", true).order("workstream_code").order("code");
  if (!wfs?.length) return [];

  const { data: versions } = await sb.from("workflow_version")
    .select("id, workflow_id").in("workflow_id", wfs.map((w) => w.id)).eq("status", "published");
  const { data: steps } = versions?.length
    ? await sb.from("workflow_step").select("workflow_version_id").in("workflow_version_id", versions.map((v) => v.id))
    : { data: [] };

  const stepsByVersion = new Map<string, number>();
  for (const st of steps ?? []) stepsByVersion.set(st.workflow_version_id, (stepsByVersion.get(st.workflow_version_id) ?? 0) + 1);
  const versionOfWorkflow = new Map((versions ?? []).map((v) => [v.workflow_id, v.id]));

  return wfs.map((w) => ({
    code: w.code, label: w.label,
    workstream: w.workstream_code ?? null,
    ownerRole: w.owner_role_code ?? null,
    stepCount: stepsByVersion.get(versionOfWorkflow.get(w.id) ?? "") ?? 0,
  }));
}

/**
 * What this task produced last time.
 *
 * Without it a second run drafts from scratch: "rework section 6" is impossible, and the new
 * version supersedes the old one without being derived from it — a version chain implying an
 * editing lineage that never happened. With it, revision is revision.
 */
async function loadPriorDraft(engagementId: string, path: string | null) {
  const sb = supabaseAdmin();
  if (!sb || !path) return null;

  const { data: doc } = await sb.from("document")
    .select("current_version_id").eq("engagement_id", engagementId).eq("path", path).maybeSingle();
  if (!doc?.current_version_id) return null;

  const { data: v } = await sb.from("document_version")
    .select("version").eq("id", doc.current_version_id).maybeSingle();
  const { data: secs } = await sb.from("document_section")
    .select("heading, body").eq("document_version_id", doc.current_version_id).order("ord");

  return v && secs?.length
    ? { version: v.version, sections: secs.map((x) => ({ heading: x.heading, body: x.body })) }
    : null;
}

/**
 * Criteria a human checked and rejected, with the reason they gave.
 *
 * Distinct from a criterion nobody has looked at — that one is simply unmeasured. A rejection is
 * someone reading the work and saying what is wrong with it, which is the most valuable input the
 * agent can get and previously had no way to reach it.
 */
async function loadRejections(taskId: string) {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const { data } = await sb.from("measurement")
    .select("detail, source, criterion(statement, subject_kind, subject_ref)")
    .eq("task_id", taskId).eq("satisfied", false).eq("source", "human");

  type Row = { detail: string | null; criterion: { statement: string; subject_kind: string | null; subject_ref: string | null } | { statement: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map((m) => {
    const c = Array.isArray(m.criterion) ? m.criterion[0] : m.criterion;
    const detail = m.detail ?? "";
    const by = detail.match(/^Rejected by ([^:]+):/)?.[1] ?? "a reviewer";
    return {
      criterion: c?.statement || "unnamed criterion",
      reason: detail.replace(/^Rejected by [^:]+:\s*/, "") || "no reason recorded",
      by,
    };
  });
}

/**
 * The agent file minus its task catalogue.
 *
 * `compass/agents/<role>.md` goes into the prompt whole, and it still carries `## Tasks I own` — a
 * list of tasks the app never dispatches, because the app takes its instruction from the ROW.
 * AGENTS.md already rules that those sections "are the initial design and are not what runs… they
 * are to be ignored rather than followed"; nothing enforced it.
 *
 * On the first live run of `file-sow` the agent followed `intake-sow` from that catalogue instead of
 * the row it was given, and asked five questions — roster, quality bar, sprint cadence, comms
 * channel — for a row whose whole job is one document. It named `intake-sow` in its own reply.
 *
 * REMOVES THE SECTION, DOES NOT TRUNCATE AT IT. `## Refusal rules`, `## Anti-patterns` and
 * `## Output summary contract` all come AFTER `## Tasks I own` in every one of the seventeen files,
 * and they are the discipline this system runs on — the reason that same agent correctly refused to
 * invent the SOW. Cutting the file at that heading would have deleted them: a scope fix that
 * silently became a discipline regression.
 *
 * The FILE keeps its sections. It is a paste-into-any-host document per
 * `[agent-as-surface-independent-unit]`, and re-authoring the seventeen of them is its own job. This
 * is only about what goes into a prompt.
 */
export function withoutTaskCatalogue(md: string): string {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => /^## Tasks I own\s*$/.test(l));
  if (start === -1) return md;              // nothing to remove is not an error

  // The next SIBLING heading. `^## ` cannot match `### `, so the task subsections inside are
  // consumed rather than ending the scan at the first one.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }

  return [...lines.slice(0, start), ...lines.slice(end)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");            // the seam, not a reformat of the whole file
}

/**
 * A step's Done criteria, in order.
 *
 * The criteria are held per workflow VERSION with an optional `step_task`, so a null `step_task` is
 * a criterion the whole workflow carries and must apply to every step. Extracted because the ticket
 * composer needs the same list: the criteria go into a ticket verbatim, and a second query that
 * forgot the null case would put a subtly shorter acceptance list on the board than the one the
 * work is actually graded against.
 */
export async function doneCriteriaFor(stepId: string): Promise<string[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: step } = await sb.from("workflow_step")
    .select("task, workflow_version_id").eq("id", stepId).maybeSingle();
  if (!step?.workflow_version_id) return [];

  const { data: cs } = await sb.from("criterion")
    .select("statement, subject_kind, subject_ref, operator, value, step_task")
    .eq("workflow_version_id", step.workflow_version_id).eq("kind", "done").order("ord");
  return (cs ?? [])
    .filter((c) => c.step_task === null || c.step_task === step.task)
    .map((c) => c.statement || `${c.subject_kind} ${c.subject_ref} ${c.operator} ${c.value}`);
}

/**
 * The markdown a role brings, ready to be a system prompt.
 *
 * Through the spec spine, not off the disk.
 *
 * Every framework file resolves in three tiers — engagement override, then org default, then what
 * compass/ ships — through `specs.ts`. The app was meant to read through that spine and instead read `compass/agents/<agent>.md` straight
 * from the filesystem, which silently dropped the first two tiers: an engagement that had
 * customised how its delivery manager works got the framework default and no error saying so.
 *
 * Null when the role has no `agent`, or when the file it names does not exist — `role.code = 'pm'`
 * points at `agents/pm.md`, which is not in the repo. A missing agent file is REPORTED by every
 * caller, never substituted. Inventing a role description would produce an agent that behaves
 * plausibly and follows none of the actual discipline.
 *
 * Stripped of its task catalogue HERE rather than in `resolveSpec`: the SpecEditor and every other
 * consumer must still see the whole document. This is about what goes into a prompt.
 */
export async function agentMarkdown(
  engagementId: string, orgId: string, roleCode: string,
): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: role } = await sb.from("role")
    .select("agent").eq("org_id", orgId).eq("code", roleCode).maybeSingle();
  if (!role?.agent) return null;

  const resolved = await resolveSpec(engagementId, `agents/${role.agent}.md`);
  return resolved ? withoutTaskCatalogue(resolved.content) : null;
}

/** Everything the agent needs, assembled from the record rather than from the caller. */
export async function buildContext(actor: Actor, taskId: string): Promise<AgentContext | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  // `must`, not a bare destructure: null here becomes `notFound()` at the call site, so a failed
  // read would tell someone their own running task does not exist. Only a genuinely absent row —
  // a bad id, or another engagement's task — may return null.
  const task = must(
    "read task",
    await sb.from("work_task")
      .select("id, title, subtitle, role_code, workflow_step_id, workflow_run_id")
      .eq("id", taskId).eq("engagement_id", actor.engagementId).maybeSingle(),
  );
  if (!task) return null;

  const agentFile = await agentMarkdown(actor.engagementId, actor.orgId, task.role_code);

  let produces: string | null = null;
  let unresolvedProduces: string | null = null;
  let destination: AgentContext["destination"] = null;
  let output: string | null = null;
  let doneCriteria: string[] = [];
  let ownOrd = Number.MAX_SAFE_INTEGER;
  let template: ResolvedTemplate | null = null;
  let templateName: string | null = null;
  let renders: AgentContext["renders"] = "none";
  let reviewPath: string | null = null;
  if (task.workflow_step_id) {
    const { data: step } = await sb.from("workflow_step")
      .select("ord, produces, output, template, renders, depends_on, workflow_version_id")
      .eq("id", task.workflow_step_id).maybeSingle();
    renders = (step?.renders as AgentContext["renders"] | null) ?? "none";

    const dest = destinationOf(step?.produces);
    // A per-subject path (`03-architecture/epic/{epic}`) is filled from the run this task belongs
    // to. Resolved HERE and nowhere else on the write side: `ctx.produces` is what gets filed, what
    // the prior draft is looked up by, and what the prompt tells the agent it is writing.
    //
    // NEVER redirected to a reviewed document, even for `doc-review`/`code-review` — a row whose
    // own `produces` is empty must keep `runAgent` refusing to file anything (`if (!ctx.produces)`
    // below `runAgent`'s own halt), or a review row's run silently overwrites what it is reviewing.
    // That is `reviewPath` below, kept OUT of this field on purpose: display and "what gets filed"
    // must not be the same field, because a review task legitimately wants the first and must
    // never get the second.
    produces = dest ? resolvePath(dest.path, await subjectOfRun(task.workflow_run_id as string | null)) : null;
    // Resolution failing is not the same as the step producing nothing, and the two must not report
    // the same way — one is a row that drafts no document, the other is a row whose document has
    // nowhere to go. Kept apart so the halt can say which.
    if (dest && !produces) unresolvedProduces = dest.path;
    destination = dest?.slot ?? null;
    output = (step?.output as string | null) ?? null;
    ownOrd = (step?.ord as number | null) ?? Number.MAX_SAFE_INTEGER;
    doneCriteria = await doneCriteriaFor(task.workflow_step_id);
    templateName = ((step?.template as string | null) ?? "").trim() || null;
    // Resolved here so `runAgent` gets a template already scoped to this engagement, and so a
    // declared name that finds nothing is visible as `templateName && !template` rather than as a
    // silent free-form draft.
    template = templateName
      ? await templateFor(templateName, actor.engagementId, actor.orgId)
      : null;

    // `doc-review`/`code-review` ONLY: what the panel shows, resolved from the ONE `depends_on`
    // row's own `produces` — read-only, display-side, never fed to `runAgent`.
    if (renders === "doc-review" || renders === "code-review") {
      const { data: reviewed } = await sb.from("workflow_step")
        .select("produces")
        .eq("workflow_version_id", step?.workflow_version_id as string)
        .eq("task", (step?.depends_on as string[] | null)?.[0] ?? "")
        .maybeSingle();
      const reviewedDest = destinationOf(reviewed?.produces);
      reviewPath = reviewedDest
        ? resolvePath(reviewedDest.path, await subjectOfRun(task.workflow_run_id as string | null))
        : null;
    }
  }

  return {
    taskId: task.id,
    engagementId: actor.engagementId,
    taskTitle: task.title,
    taskSubtitle: task.subtitle ?? "",
    roleCode: task.role_code,
    agentFile,
    produces,
    unresolvedProduces,
    renders,
    reviewPath,
    hasWebSearch: actor.capabilities.includes("web-search"),
    destination,
    output,
    inputs: await ensureInputs(taskId, actor.engagementId),
    doneCriteria,
    inventory: await loadInventory(actor.orgId),
    phaseRows: await loadPhaseRows(task.id, task.workflow_run_id as string | null, ownOrd),
    template,
    templateName,
    priorDraft: await loadPriorDraft(actor.engagementId, produces),
    rejections: await loadRejections(taskId),
    sprint: produces === SPRINT_PLAN_PATH
      ? await loadSprintContext(actor.engagementId, taskId)
      : null,
  };
}

/** The one path that makes a step a sprint plan. Keyed on the path, never on either row's slug. */
const SPRINT_PLAN_PATH = "05-cadence/sprint-plans";

/**
 * What this sprint is, and what is left to commit.
 *
 * The number comes first and is allocated, not guessed — the agent's prose must name the same
 * sprint the labels will, or the published page and the board disagree from the first draft.
 *
 * Everything else is a question for the tracker. `committedJql` asks which stories are already in
 * sprints 1..N-1 and those are subtracted; a tracker that cannot be reached leaves
 * `reachedTracker: false` and the prompt says so rather than presenting an empty answer as a
 * complete one.
 */
async function loadSprintContext(
  engagementId: string, taskId: string,
): Promise<SprintContext | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const number = await nextSprintNumber(engagementId, taskId);

  const { data: stories } = await sb
    .from("backlog_item")
    .select("ref, title, ticket_key, parent_ref")
    .eq("engagement_id", engagementId).eq("kind", "story").order("ord");

  const { data: eng } = await sb
    .from("engagement")
    .select("jira_project, atlassian_base_url, atlassian_email, atlassian_api_token")
    .eq("id", engagementId).maybeSingle();
  const creds = eng ? resolveJira(eng) : null;

  // Already-committed keys, straight from the board.
  let taken = new Set<string>();
  let reachedTracker = false;
  if (creds && number > 1) {
    const found = await searchIssues(creds, committedJql(creds.project, number - 1), ["summary"]);
    // null is "could not ask" and [] is "asked, nothing is committed" — collapsing them here is
    // exactly how an agent would be told the backlog is wide open during a Jira outage.
    if (found !== null) {
      reachedTracker = true;
      taken = new Set(found.map((i) => i.key));
    }
  } else if (creds) {
    // Sprint 1: nothing can be committed yet, so there is nothing to ask and no outage to hide.
    reachedTracker = true;
  }

  // Through `holdersOn`, so the roster the agent is handed includes roles held at ORG level — the
  // PMO Analyst is on every engagement in the org without being staffed to each one.
  const byRole = new Map<string, string[]>();
  for (const m of await holdersOn(engagementId)) {
    if (!m.role || !m.name) continue;
    byRole.set(m.role, [...(byRole.get(m.role) ?? []), m.name]);
  }

  return {
    number,
    committable: (stories ?? [])
      .filter((s) => !s.ticket_key || !taken.has(s.ticket_key as string))
      .map((s) => ({
        ref: s.ref as string,
        ticketKey: (s.ticket_key as string | null) ?? null,
        title: s.title as string,
        epic: (s.parent_ref as string | null) ?? null,
      })),
    roster: [...byRole].map(([role, holders]) => ({ role, holders })),
    reachedTracker,
  };
}

/**
 * The system prompt.
 *
 * The Done criteria go in as the stopping condition, not as decoration. They are what the work is
 * measured against, so the agent should know them before it starts rather than be graded on them
 * afterwards — that was the whole point of holding them as structure.
 */
export function systemPrompt(ctx: AgentContext): string {
  const parts: string[] = [];

  parts.push(ctx.agentFile
    ? ctx.agentFile
    : `You are the ${ctx.roleCode} on a delivery engagement. No agent definition file was found for this role, so you are working without its usual discipline — say so in your first message rather than improvising one.`);

  if (ctx.inventory.length) {
    const unspecified = ctx.inventory.filter((w) => w.stepCount === 0);
    parts.push(`
# The workflows this engagement can run

This is the complete list. Do not name a workflow that is not on it, and do not assume a workflow
exists because the work obviously needs doing — if a piece of scope has no workflow here, that is
a real gap and naming it is more useful than inventing a row to cover it.

${ctx.inventory.map((w) =>
  `- \`${w.code}\` — ${w.label}${w.workstream ? ` · ${w.workstream}` : ""}${w.ownerRole ? ` · owned by ${w.ownerRole}` : ""}` +
  (w.stepCount === 0 ? " · STEPS UNSPECIFIED" : ` · ${w.stepCount} steps`)).join("\n")}
${unspecified.length ? `
${unspecified.length} of these have no steps specified — the command exists but its dispatch graph was never
written. You may place work against them; you cannot say what they do step by step.` : ""}`.trim());
  } else {
    parts.push(`
# The workflows this engagement can run

No workflow inventory was found. Say so rather than working from what you assume Compass provides —
any workflow name you produce would be a guess.`.trim());
  }

  if (ctx.phaseRows.length) {
    parts.push(`
# The rest of this phase

Each row below is somebody's work, with its own deliverable and its own gate.

A row AFTER yours is not a gap for you to fill. What it produces is that row's to gather — and
asking for it here does not just make the human answer twice: **the answer is lost**. It lands in
this task's conversation, and the row that needs it never reads it. Name the row instead, and let
the person hear that it is coming.

A row BEFORE yours has already produced something. If you were not given it and you need it, say
which row and which document rather than asking the human to retype what Compass already has.

${ctx.phaseRows.map((r) =>
  `- ${r.ord} · ${r.title}${r.role ? ` — ${r.role}` : ""}` +
  (r.produces ? ` → ${r.produces}` : "") +
  (r.later ? "   (after yours)" : "")).join("\n")}`.trim());
  }

  parts.push(`
# This task

${ctx.taskTitle}${ctx.taskSubtitle ? ` — ${ctx.taskSubtitle}` : ""}
${ctx.produces ? `\nYou are producing: ${ctx.produces}` : ""}

# When this is done

${ctx.doneCriteria.length
    ? ctx.doneCriteria.map((c) => `- ${c}`).join("\n")
    : "- No done criteria are recorded. Say so; do not invent a bar for your own work."}

These are the criteria your output is measured against. Work to them.

# How to work
${(() => {
  // Mirrors `toolsFor`'s own condition exactly — `ask` alone is what a `doc-review`/`code-review`
  // row gets (nothing to file, so `draft` is withheld, the same reason `supplied` withholds it),
  // and a `supplied` row (received, not authored) gets it too, via `TOOL_FOR`. Said HERE, not just
  // decided in the tool list, because "you have two tools and must use one" told a review row with
  // nothing left to ask that it had to invent a question anyway — the model said so outright: "this
  // call is only to satisfy the required structured-output step." A hardcoded instruction is advice
  // that stopped matching what was actually offered, and the fix is the prompt agreeing with the
  // tool list rather than a model being right that something was demanded of it that made no sense.
  const askOnly = !ctx.produces || ctx.output === "supplied";
  if (askOnly) {
    return `
You have one tool: \`ask\`. Use it when something you need is genuinely not in what you were given
and you cannot responsibly infer it — the same discipline as any other row: dates never agreed,
people never named, standards nobody wrote down are things to ask about, not invent.

This row does not author a document. When you have nothing left that needs asking — including a
review that is simply finished — say so in plain text and call no tool at all. That is a complete,
successful turn here, not a gap to fill with a question that only exists to have used the tool.
Inventing a filler question ("anything else needed?") when you have nothing to ask is worse than
silence: it reopens a round the person already closed.`.trim();
  }
  return `
You have two tools and must use one of them.

Use \`ask\` when something you need is genuinely not in what you were given and you cannot
responsibly infer it. Deriving a plan from a contract means reading what the contract says — it
does not mean filling in what it omits. Dates that were never agreed, people who were never named,
and standards nobody wrote down are things to ask about, not to invent.

Ask the way a colleague would, not the way a form does. Take the few things that decide the shape of
everything else and ask those first — the answers come back to you and you get another turn, so
anything a later answer would settle is not for this round. Order your questions by how much each
answer changes the rest of the work: only the first ${ASK_BATCH} reach the human, so that ordering
is your decision about what matters, not a formality. You get at most ${ASK_ROUNDS_MAX} rounds, and
you will be told when you are on your last.

Use \`draft\` when you can produce the deliverable from what you have. Every section carries the
document paths it was derived from. A claim you cannot trace to a source you were given does not
belong in the draft — if it is important and unsupported, that is an \`ask\`.

If some of your inputs are missing, say which, and say what that costs. Producing a confident
deliverable from a third of the intended inputs, without noting it, is the failure this whole
system exists to prevent.`.trim();
})()}
${ctx.hasWebSearch ? `
# Web search

You have real web search. Use it for anything that has to come from outside what you were given —
market data, competitors, what users actually say in public, current facts a document cannot hold.
It is the difference between citing a source and guessing one; do not answer from training data
where a search would give you something real and current instead.` : ""}`.trim());

  return parts.join("\n\n---\n\n");
}

/**
 * What to say about the previous attempt.
 *
 * Appended as its own turn rather than folded into the system prompt: this is feedback on work,
 * and it belongs in the conversation where the work was discussed.
 */
export function revisionPrompt(ctx: AgentContext): string | null {
  if (!ctx.priorDraft) return null;

  // NOT FOR A SUPPLIED ROW. On one of those `priorDraft` is the CLIENT'S document — pasted by a
  // person — and everything below says "you already produced this, revise it". Handed that
  // alongside the supplied instruction ("you do not write it, never restructure it"), the model
  // resolved the contradiction the only way it could: it asked the person for a revised version,
  // and `file-requirements` looped. It never produced this, and must not be told that it did.
  if (ctx.output === "supplied") return null;

  const parts = [
    `You already produced \`${ctx.produces}\` at v${ctx.priorDraft.version}. Here it is:`,
    ctx.priorDraft.sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n"),
  ];

  if (ctx.rejections.length) {
    parts.push(
      `A reviewer read it and rejected ${ctx.rejections.length} of the completion criteria:\n\n` +
      ctx.rejections.map((r) => `- **${r.criterion}** — ${r.by} says: ${r.reason}`).join("\n") +
      `\n\nRevise the document to address these. Keep everything that was not objected to: a rewrite ` +
      `that silently drops sections nobody complained about is not a revision, and a reviewer who has ` +
      `already read this should not have to re-read all of it. If you disagree with a rejection, say so ` +
      `and explain — do not quietly comply with something you think is wrong.`);
  } else {
    parts.push(
      `Revise it rather than starting over. Keep what still holds, change what should change, and say ` +
      `what you changed and why. If nothing needs changing, say that instead of redrafting.`);
  }

  return parts.join("\n\n");
}

/** The user turn: the pinned material, with absences stated rather than omitted. */
export function inputPrompt(ctx: AgentContext): string {
  const present = ctx.inputs.filter((i) => i.body);
  const missing = ctx.inputs.filter((i) => !i.body);

  const parts = present.map((i) =>
    `<document path="${i.path}" version="${i.version}" title="${i.title ?? ""}">\n${i.body}\n</document>`);

  if (!ctx.inputs.length) {
    // True only when the STEP declares no reads. It used to be said whenever pinning had not
    // happened, which told an agent it had no inputs while its step declared one — and it went and
    // asked the human for a document already filed and published.
    //
    // A PART, not an early return. Returning here skipped everything appended below — so a row with
    // no reads got no template, no sprint block and, once supplied rows existed, no supplied
    // instruction at all. `file-sow` was told only "this task declares no input documents" and
    // behaved correctly by luck: it had no `draft` tool, so asking was the only thing left.
    parts.push("This task declares no input documents. Say so before doing anything else.");
  }

  if (missing.length) {
    parts.push(
      `<missing>\nThese documents are declared inputs to this task but have not been drafted:\n` +
      missing.map((m) => `- ${m.path}${m.title ? ` (${m.title})` : ""}`).join("\n") +
      `\n\nThey are empty, not withheld. Take this into account and say what it costs.\n</missing>`);
  }

  if (ctx.sprint) parts.push(sprintPrompt(ctx.sprint));
  if (ctx.template) parts.push(templatePrompt(ctx.template));
  if (ctx.output === "supplied") parts.push(suppliedPrompt(ctx));

  return parts.join("\n\n");
}

/**
 * This deliverable is handed over, not written.
 *
 * The TOOLS already enforce it — a supplied row is given `ask` and nothing else, so there is no
 * way to author the document. This block exists so the model does not spend a turn discovering
 * that, and so the question it asks is the right shape: the answer IS the deliverable.
 *
 * It also says what to do on the run AFTER the document is filed, which is the only interesting
 * case: with something to compare against, report the comparison and stop. Without that sentence a
 * model handed a filed document and a source tends to try to improve one of them.
 */
function suppliedPrompt(ctx: AgentContext): string {
  const path = ctx.produces ?? "the path this row produces";
  const head = [
    `<supplied path="${ctx.produces ?? ""}">`,
    `This deliverable is SUPPLIED BY A PERSON. You do not write it.`,
    ``,
  ];

  // NOT SUPPLIED YET.
  if (!ctx.priorDraft) {
    return [
      ...head,
      `It has not been supplied yet. Ask for it, in ONE question, and say what it is for. Say that`,
      `they can paste the text, give a link, or upload the file itself — a PDF, a Word document or`,
      `a spreadsheet — because Compass reads all three. What you are given is filed verbatim at`,
      `\`${path}\` — do not summarise it, restructure it, correct it or improve it. It is the`,
      `client's document and it is the record.`,
      ``,
      `If you need anything else, ask for it in a SEPARATE question — never in the one that carries`,
      `the document, because that answer is filed as the document itself.`,
      `</supplied>`,
    ].join("\n");
  }

  // ALREADY SUPPLIED. Shown here, as the supplied document, and nowhere else.
  //
  // It used to reach the model only through `revisionPrompt`, labelled "you already produced this".
  // So the instruction to compare it had nothing to point at, and the one thing the model could see
  // told it to revise a document it had also been told it must never revise.
  const filed = [
    `<supplied-document path="${ctx.produces ?? ""}" version="${ctx.priorDraft.version}">`,
    ctx.priorDraft.sections.map((x) => `## ${x.heading}\n\n${x.body}`).join("\n\n"),
    `</supplied-document>`,
  ].join("\n");

  const next = ctx.inputs.length
    ? `Compare it against the document(s) above and say plainly where they agree and where they do ` +
      `not — dates, scope, deliverables, anything one states and the other contradicts. Report that ` +
      `in your reply. There is nothing to file and nothing to ask. Then stop.`
    : `There is nothing to compare it against, so this row is finished. Say so and stop.`;

  return [
    ...head,
    `It HAS been supplied and is already filed at \`${path}\` as v${ctx.priorDraft.version}. Here it is:`,
    ``,
    filed,
    ``,
    next,
    ``,
    // The exact move the model made when it had nowhere else to go: it asked for "the revised
    // requirements text". Ruled out by name, because a general instruction did not cover it.
    `Do NOT ask for it again, and do NOT ask for a revised version. If it needs revising, the`,
    `person will supply one and this row will run again with it.`,
    `</supplied>`,
  ].join("\n");
}

/**
 * The shape the deliverable must arrive in.
 *
 * LAST in the prompt, after the documents and any sprint block, because it governs what to WRITE
 * rather than what to read — and the instruction closest to the output is the one a model follows
 * most reliably.
 *
 * Stated as a floor, in both directions, because both halves are load-bearing. Omitting a section
 * is refused at filing time, so a model that quietly drops one wastes a whole run; and a model told
 * only "use these headings" will faithfully produce those and nothing else, dropping material the
 * deliverable actually needed because the template did not anticipate it.
 *
 * The headings are given with the template's own numbering and the filing check strips it, so a
 * draft that writes `## Scope of Work` for `## 2. Scope of Work` is accepted. Saying "copy them
 * exactly" would be asking for a precision that is neither needed nor enforced, and instructions
 * the system does not enforce are how a model learns which ones to ignore.
 */
function templatePrompt(t: ResolvedTemplate): string {
  return [
    `<template name="${t.name}">`,
    `This deliverable has a required shape. Produce a section for EVERY heading below, in this`,
    `order, using these headings.`,
    ``,
    `You may ADD sections the deliverable needs — the template is a floor, not a cast, and extra`,
    `sections are kept. You may not omit one: a draft missing any of these is refused and nothing`,
    `is filed. A section that genuinely does not apply still gets its heading, and says so.`,
    ``,
    `The prose under each heading is guidance for what belongs there, written for whoever fills`,
    `the template in. Do not copy it into your draft.`,
    ``,
    describeTemplate(t),
    `</template>`,
  ].join("\n");
}

/**
 * What a sprint plan is given beyond its documents.
 *
 * The number is STATED rather than left to the model. A model that picks its own sprint number
 * picks one that already exists, and the page then names a different sprint from the labels — two
 * records of one sprint, which is the failure this whole design avoids by keeping only one.
 *
 * The tracker's silence is stated too. "No stories are committed yet" and "the board could not be
 * read" produce the same empty list and mean opposite things; an agent that cannot tell them apart
 * will re-commit work already in flight, and every story would look correctly planned.
 */
function sprintPrompt(s: SprintContext): string {
  const roster = s.roster.length
    ? s.roster.map((r) => `- ${r.role}: ${r.holders.join(", ")}`).join("\n")
    : "- Nobody is on the roster. Say what that costs rather than committing against nobody.";

  const stories = s.committable.length
    ? s.committable.map((c) =>
        `- \`${c.ref}\`${c.epic ? ` (epic \`${c.epic}\`)` : ""} — ${c.title}` +
        (c.ticketKey ? ` [${c.ticketKey}]` : " — NOT ON THE BOARD"),
      ).join("\n")
    : "- Nothing. Do not invent stories; say the backlog is empty.";

  const caveat = s.reachedTracker
    ? ""
    : `\n\nTHE TRACKER COULD NOT BE READ. The list above has NOT had already-committed stories ` +
      `removed, so some of it may already be in an earlier sprint. Say this in the plan rather ` +
      `than committing as though the list were clean.`;

  return [
    `<sprint number="${s.number}">`,
    `You are planning sprint ${s.number}. Use that number wherever the plan names the sprint.`,
    ``,
    `Commit ONLY from these stories:`,
    stories,
    ``,
    `The roster you are committing against:`,
    roster,
    caveat,
    `</sprint>`,
  ].join("\n");
}
