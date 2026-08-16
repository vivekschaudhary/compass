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
import { readFile } from "fs/promises";
import { join } from "path";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./../data/actor";

const COMPASS_DIR = process.env.COMPASS_DIR
  ?? join(process.env.COMPASS_REPO ?? join(process.cwd(), ".."), "compass");

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
  produces: string | null;
  inputs: PinnedInput[];
  doneCriteria: string[];
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

/** Load the pinned documents' text, at the pinned version. */
async function loadInputs(taskId: string, engagementId: string): Promise<PinnedInput[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: pins } = await sb.from("task_input")
    .select("document_path, document_version").eq("task_id", taskId).order("document_path");
  if (!pins?.length) return [];

  const out: PinnedInput[] = [];
  for (const pin of pins) {
    const { data: doc } = await sb.from("document")
      .select("id, title").eq("engagement_id", engagementId).eq("path", pin.document_path).maybeSingle();

    if (!doc || !pin.document_version) {
      out.push({ path: pin.document_path, title: doc?.title ?? null, version: null, body: null });
      continue;
    }

    // The PINNED version, not the current one. This is the whole point of pinning.
    const { data: v } = await sb.from("document_version")
      .select("id").eq("document_id", doc.id).eq("version", pin.document_version).maybeSingle();

    const { data: sections } = v
      ? await sb.from("document_section").select("heading, body").eq("document_version_id", v.id).order("ord")
      : { data: [] };

    const body = (sections ?? []).map((s) => `## ${s.heading}\n${s.body}`).join("\n\n");
    out.push({
      path: pin.document_path, title: doc.title, version: pin.document_version,
      body: body || null,
    });
  }
  return out;
}

/** Everything the agent needs, assembled from the record rather than from the caller. */
export async function buildContext(actor: Actor, taskId: string): Promise<AgentContext | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: task } = await sb.from("work_task")
    .select("id, title, subtitle, role_code, workflow_step_id")
    .eq("id", taskId).eq("engagement_id", actor.engagementId).maybeSingle();
  if (!task) return null;

  const { data: role } = await sb.from("role")
    .select("agent").eq("org_id", actor.orgId).eq("code", task.role_code).maybeSingle();

  let agentFile: string | null = null;
  if (role?.agent) {
    try {
      agentFile = await readFile(join(COMPASS_DIR, "agents", `${role.agent}.md`), "utf-8");
    } catch {
      // A missing agent file is reported, never substituted. Inventing a role description would
      // produce an agent that behaves plausibly and follows none of the actual discipline.
      agentFile = null;
    }
  }

  let produces: string | null = null;
  let doneCriteria: string[] = [];
  if (task.workflow_step_id) {
    const { data: step } = await sb.from("workflow_step")
      .select("ord, produces, workflow_version_id").eq("id", task.workflow_step_id).maybeSingle();
    produces = step?.produces ?? null;

    if (step?.workflow_version_id) {
      const { data: cs } = await sb.from("criterion")
        .select("statement, subject_kind, subject_ref, operator, value, step_ord")
        .eq("workflow_version_id", step.workflow_version_id).eq("kind", "done").order("ord");
      doneCriteria = (cs ?? [])
        .filter((c) => c.step_ord === null || c.step_ord === step.ord)
        .map((c) => c.statement || `${c.subject_kind} ${c.subject_ref} ${c.operator} ${c.value}`);
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
    inputs: await loadInputs(taskId, actor.engagementId),
    doneCriteria,
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
and standards nobody wrote down are things to ask about, not to invent. Ask everything you need in
one go rather than one question at a time.

Use \`draft\` when you can produce the deliverable from what you have. Every section carries the
document paths it was derived from. A claim you cannot trace to a source you were given does not
belong in the draft — if it is important and unsupported, that is an \`ask\`.

If some of your inputs are missing, say which, and say what that costs. Producing a confident
deliverable from a third of the intended inputs, without noting it, is the failure this whole
system exists to prevent.`.trim());

  return parts.join("\n\n---\n\n");
}

/** The user turn: the pinned material, with absences stated rather than omitted. */
export function inputPrompt(ctx: AgentContext): string {
  if (!ctx.inputs.length) {
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
