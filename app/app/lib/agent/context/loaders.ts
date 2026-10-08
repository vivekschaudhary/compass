import { resolveSpec } from "../../specs";
import { templateFor } from "../../data/templates";
import type { ResolvedTemplate } from "../../data/templates";
import { destinationOf, resolvePath } from "../../adapters";
import { supabaseAdmin, must } from "../../supabase";
import { resolveJira, searchIssues } from "../../jira";
import { nextSprintNumber, committedJql } from "../../data/sprint";
import { holdersOn, type Actor } from "../../data/actor";
import { sortByStep } from "../../data/steps";
import { subjectOfRun } from "../../data/run-subject";
import { withoutTaskCatalogue } from "./prompts";
import { resolveReviewedTask } from "./resolve-reviewed-task";
import type { AgentContext, PhaseRow, PinnedInput, SprintContext, WorkflowSummary } from "./types";

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
/** The registered name for a repo key, so the prompt can say "kt-api", not just "api". */
async function repoNameFor(engagementId: string, key: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("repo").select("name")
    .eq("engagement_id", engagementId).eq("key", key).maybeSingle();
  return (data?.name as string | null) ?? key;
}

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
      .select("id, title, subtitle, role_code, workflow_step_id, workflow_run_id, subject_ref")
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
    produces = dest
      ? resolvePath(dest.path, await subjectOfRun(task.workflow_run_id as string | null, task.subject_ref as string | null))
      : null;
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

    // `doc-review`/`code-review` ONLY: what the panel shows — read-only, display-side, never fed to
    // `runAgent`. NOT always the one `depends_on` row: a review-of-a-review chain (`review-scaffold`
    // reviews `scaffold-foundation`'s output; `accept-scaffold` depends on `review-scaffold`, which
    // is itself a `doc-review` row with no `produces` of its own) left this at a single hop, found a
    // step with nothing to show, and the whole ApprovePanel silently never appeared — the row was
    // genuinely `hitl`, waiting on a human, with no visible way to act on it. `resolveReviewedTask`
    // walks back through `depends_on` until it finds a step that actually produces something.
    if (renders === "doc-review" || renders === "code-review") {
      const startTask = (step?.depends_on as string[] | null)?.[0] ?? null;
      const reviewedProduces = await resolveReviewedTask(startTask, async (t) => {
        const { data } = await sb.from("workflow_step")
          .select("produces, depends_on")
          .eq("workflow_version_id", step?.workflow_version_id as string)
          .eq("task", t)
          .maybeSingle();
        return data
          ? { produces: data.produces as string | null, dependsOn: data.depends_on as string[] | null }
          : null;
      });
      const reviewedDest = destinationOf(reviewedProduces);
      reviewPath = reviewedDest
        ? resolvePath(
            reviewedDest.path,
            await subjectOfRun(task.workflow_run_id as string | null, task.subject_ref as string | null),
          )
        : null;
    }
  }

  // The run's own subject, for display — a `scaffold` row has no per-subject `produces` path to
  // resolve through (its deliverable is a pull request, not a document), so this is the only place
  // the repo key reaches the prompt. See `scaffoldPrompt` in `./prompts`.
  const subject = task.workflow_step_id ? await subjectOfRun(task.workflow_run_id as string | null) : null;

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
    subject,
    repoName: output === "scaffold" && subject?.ref
      ? await repoNameFor(actor.engagementId, subject.ref)
      : null,
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
