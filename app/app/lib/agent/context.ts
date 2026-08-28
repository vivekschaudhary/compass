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
import { destinationOf } from "../adapters";
import { supabaseAdmin, must } from "../supabase";
import type { Actor } from "./../data/actor";


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
  /** Where it goes. `docs` publishes a page; `tickets` creates issues on the board. */
  destination: "docs" | "tickets" | null;
  inputs: PinnedInput[];
  doneCriteria: string[];
  /** What workflows this engagement can actually run. Without it the agent guesses. */
  inventory: WorkflowSummary[];
  /** What it produced last time, and what a reviewer said about it. Null on the first run. */
  priorDraft: { version: string; sections: { heading: string; body: string }[] } | null;
  rejections: { criterion: string; reason: string; by: string }[];
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
 * v1 resolves every framework file in three tiers — engagement override, then org default, then
 * what compass/ ships — and `specs.ts` says plainly that BOTH runtimes read through it. v2 was
 * meant to be a new surface on that spine and instead read `compass/agents/<agent>.md` straight
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
      .select("id, title, subtitle, role_code, workflow_step_id")
      .eq("id", taskId).eq("engagement_id", actor.engagementId).maybeSingle(),
  );
  if (!task) return null;

  const agentFile = await agentMarkdown(actor.engagementId, actor.orgId, task.role_code);

  let produces: string | null = null;
  let destination: AgentContext["destination"] = null;
  let doneCriteria: string[] = [];
  if (task.workflow_step_id) {
    const { data: step } = await sb.from("workflow_step")
      .select("produces").eq("id", task.workflow_step_id).maybeSingle();
    const dest = destinationOf(step?.produces);
    produces = dest?.path ?? null;
    destination = dest?.slot ?? null;
    doneCriteria = await doneCriteriaFor(task.workflow_step_id);
  }

  return {
    taskId: task.id,
    engagementId: actor.engagementId,
    taskTitle: task.title,
    taskSubtitle: task.subtitle ?? "",
    roleCode: task.role_code,
    agentFile,
    produces,
    destination,
    inputs: await ensureInputs(taskId, actor.engagementId),
    doneCriteria,
    inventory: await loadInventory(actor.orgId),
    priorDraft: await loadPriorDraft(actor.engagementId, produces),
    rejections: await loadRejections(taskId),
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
system exists to prevent.`.trim());

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
  if (!ctx.inputs.length) {
    // True only when the STEP declares no reads. It used to be said whenever pinning had not
    // happened, which told an agent it had no inputs while its step declared one — and it went and
    // asked the human for a document already filed and published.
    return "This task declares no input documents. Say so before doing anything else.";
  }

  const present = ctx.inputs.filter((i) => i.body);
  const missing = ctx.inputs.filter((i) => !i.body);

  const parts = present.map((i) =>
    `<document path="${i.path}" version="${i.version}" title="${i.title ?? ""}">\n${i.body}\n</document>`);

  if (missing.length) {
    parts.push(
      `<missing>\nThese documents are declared inputs to this task but have not been drafted:\n` +
      missing.map((m) => `- ${m.path}${m.title ? ` (${m.title})` : ""}`).join("\n") +
      `\n\nThey are empty, not withheld. Take this into account and say what it costs.\n</missing>`);
  }

  return parts.join("\n\n");
}
