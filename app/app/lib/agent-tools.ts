import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase";
import { jiraForStory, addComment } from "./jira";
import { transitionIssue } from "./jira";
import { STATUS } from "./lifecycle";
import { applyPatch, raiseQuestions, ALLOW, type QuestionTarget, type QuestionType } from "./questions";
import { runOrchestrator } from "./orchestrator";

// ── The agentic Execution-Help tool contract ────────────────────────────────
// Two tiers, one safety model:
//   READ tools  — auto-run inline, never mutate. Scoped to the active engagement (no cross-engagement
//                 / fixture leak: a missing row returns an honest "not found", never the demo fixture).
//   WRITE tools — require explicit human confirmation in the UI before they execute. Every write goes
//                 through existing, already-guarded code (Jira lifecycle, the questions ALLOW map,
//                 the shared orchestrator spawn) — the agent gets no new privileged path.

export type ToolContext = {
  sb: SupabaseClient;
  engagementId: string;
  role: string;            // the active role lens
  anchor?: { kind: string; id: string } | null;
};

// A tool result fed back to the model. `stream` tools (rerun_workflow) emit live output via `emit`
// during execution and return a short summary as the tool_result content.
export type ToolResult = { content: string; is_error?: boolean };
export type Emit = (s: string) => void;
type Executor = (input: Record<string, unknown>, ctx: ToolContext, emit: Emit) => Promise<ToolResult>;

type ToolDef = {
  name: string;
  write: boolean;                    // true → confirm-before-execute
  spec: { name: string; description: string; input_schema: Record<string, unknown> };
  run: Executor;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// ── READ tools ──────────────────────────────────────────────────────────────

const getTicket: ToolDef = {
  name: "get_ticket", write: false,
  spec: {
    name: "get_ticket",
    description: "Read one story/ticket in this engagement: title, status, role owner, assignee, acceptance criteria, blocked reason, and its epic. Use before advising on or acting on a ticket.",
    input_schema: { type: "object", properties: { story_id: { type: "string", description: "the Jira story key, e.g. KAN-112" } }, required: ["story_id"] },
  },
  run: async (input, ctx) => {
    const id = str(input.story_id);
    const { data: story } = await ctx.sb.from("story")
      .select("id, title, status, role, assignee, acceptance, blocked_reason, estimate_pts, ac_pass_pct, epic_id")
      .eq("id", id).maybeSingle();
    if (!story) return { content: `No ticket "${id}" in this engagement.`, is_error: true };
    const { data: epic } = story.epic_id
      ? await ctx.sb.from("epic").select("id, title, discipline, phase, engagement_id").eq("id", story.epic_id).maybeSingle()
      : { data: null };
    // scope guard — never surface a ticket from another engagement
    if (epic && epic.engagement_id && epic.engagement_id !== ctx.engagementId)
      return { content: `Ticket "${id}" is not in the active engagement.`, is_error: true };
    return { content: JSON.stringify({ story, epic }) };
  },
};

const getRunLog: ToolDef = {
  name: "get_run_log", write: false,
  spec: {
    name: "get_run_log",
    description: "Read an orchestrator run: status, failed step, error, stored diagnosis, and the tail of its log. Omit run_id to read the run this thread is anchored to. Use to diagnose why a build/fix failed.",
    input_schema: { type: "object", properties: { run_id: { type: "string", description: "run id, e.g. build-KAN-112; optional if the thread is anchored to a run" } } },
  },
  run: async (input, ctx) => {
    const id = str(input.run_id) || (ctx.anchor?.kind === "run" ? ctx.anchor.id : "");
    if (!id) return { content: "No run_id given and this thread isn't anchored to a run.", is_error: true };
    const { data: run } = await ctx.sb.from("run")
      .select("id, engagement_id, role, story, status, failed_step, error, diagnosis, workflow, log, created_at")
      .eq("id", id).maybeSingle();
    if (!run) return { content: `No run "${id}" found.`, is_error: true };
    if (run.engagement_id && run.engagement_id !== ctx.engagementId)
      return { content: `Run "${id}" is not in the active engagement.`, is_error: true };
    const log = typeof run.log === "string" ? run.log.slice(-4000) : "";
    return { content: JSON.stringify({ ...run, log }) };
  },
};

const listStories: ToolDef = {
  name: "list_stories", write: false,
  spec: {
    name: "list_stories",
    description: "List stories in this engagement, newest first. Optionally filter by status or by the role that owns them. Use to find the ticket the user means.",
    input_schema: { type: "object", properties: {
      status: { type: "string", description: "optional exact status filter, e.g. 'In Progress', 'Blocked'" },
      role: { type: "string", description: "optional owning-role code filter, e.g. 'engineer'" },
    } },
  },
  run: async (input, ctx) => {
    const { data: epics } = await ctx.sb.from("epic").select("id").eq("engagement_id", ctx.engagementId);
    const epicIds = (epics ?? []).map((e) => e.id);
    if (!epicIds.length) return { content: "[]" };
    let q = ctx.sb.from("story").select("id, title, status, role, assignee, blocked_reason").in("epic_id", epicIds);
    if (str(input.status)) q = q.eq("status", str(input.status));
    if (str(input.role)) q = q.eq("role", str(input.role));
    const { data } = await q.limit(40);
    return { content: JSON.stringify(data ?? []) };
  },
};

const getEngagementState: ToolDef = {
  name: "get_engagement_state", write: false,
  spec: {
    name: "get_engagement_state",
    description: "Read the active engagement's high-level state: name, client, phase, quality bar, Jira project, and configured repos. Use for orientation and to know what the program is.",
    input_schema: { type: "object", properties: {} },
  },
  run: async (_input, ctx) => {
    const { data: eng } = await ctx.sb.from("engagement")
      .select("id, name, client, phase, quality_bar, overall, jira_project, docs_provider")
      .eq("id", ctx.engagementId).maybeSingle();
    if (!eng) return { content: "Active engagement not found.", is_error: true };
    const { data: repos } = await ctx.sb.from("repo").select("name, area, local_path").eq("engagement_id", ctx.engagementId);
    return { content: JSON.stringify({ engagement: eng, repos: repos ?? [] }) };
  },
};

// ── WRITE tools (confirm-before-execute) ─────────────────────────────────────

const transitionTicket: ToolDef = {
  name: "transition_ticket", write: true,
  spec: {
    name: "transition_ticket",
    description: "Move a ticket to a new lifecycle status in Jira. Allowed statuses only: Backlog, To Do, In Progress, Awaiting HITL approval, Done.",
    input_schema: { type: "object", properties: {
      story_id: { type: "string" },
      to_status: { type: "string", description: "one of: Backlog, To Do, In Progress, Awaiting HITL approval, Done" },
    }, required: ["story_id", "to_status"] },
  },
  run: async (input, ctx) => {
    const id = str(input.story_id), to = str(input.to_status);
    const allowed = Object.values(STATUS) as string[];
    if (!allowed.includes(to)) return { content: `"${to}" is not an allowed status. Allowed: ${allowed.join(", ")}.`, is_error: true };
    // scope: the story must belong to this engagement
    const { data: story } = await ctx.sb.from("story").select("epic_id").eq("id", id).maybeSingle();
    const { data: epic } = story?.epic_id ? await ctx.sb.from("epic").select("engagement_id").eq("id", story.epic_id).maybeSingle() : { data: null };
    if (!story || epic?.engagement_id !== ctx.engagementId) return { content: `Ticket "${id}" is not in the active engagement.`, is_error: true };
    const jira = await jiraForStory(id);
    if (!jira) return { content: "Jira isn't wired for this engagement — nothing moved.", is_error: true };
    const ok = await transitionIssue(jira, id, to);
    return ok ? { content: `${id} → ${to}.` } : { content: `Couldn't move ${id} to ${to} (is that status on the board?).`, is_error: true };
  },
};

const patchField: ToolDef = {
  name: "patch_field", write: true,
  spec: {
    name: "patch_field",
    description: `Set one allowlisted field on one row. ONLY these table.column targets are writable: ${Object.entries(ALLOW).map(([t, cols]) => `${t}(${cols.join(",")})`).join("; ")}. Anything else is rejected.`,
    input_schema: { type: "object", properties: {
      table: { type: "string" }, id: { type: "string" }, column: { type: "string" }, value: { type: "string" },
    }, required: ["table", "id", "column", "value"] },
  },
  run: async (input, ctx) => {
    const target: QuestionTarget = { table: str(input.table), id: str(input.id), column: str(input.column) };
    const res = await applyPatch(ctx.sb, target, str(input.value));
    return res.ok
      ? { content: `Set ${target.table}.${target.column} on ${target.id}.` }
      : { content: `Rejected: ${res.error}.`, is_error: true };
  },
};

const postComment: ToolDef = {
  name: "post_comment", write: true,
  spec: {
    name: "post_comment",
    description: "Post a comment on a Jira ticket. Use to record a decision, hand off context, or note a next step on the ticket itself.",
    input_schema: { type: "object", properties: { story_id: { type: "string" }, text: { type: "string" } }, required: ["story_id", "text"] },
  },
  run: async (input, ctx) => {
    const id = str(input.story_id), text = str(input.text);
    if (!text) return { content: "Empty comment — nothing posted.", is_error: true };
    // scope: only comment on a ticket in the active engagement
    const { data: story } = await ctx.sb.from("story").select("epic_id").eq("id", id).maybeSingle();
    const { data: epic } = story?.epic_id ? await ctx.sb.from("epic").select("engagement_id").eq("id", story.epic_id).maybeSingle() : { data: null };
    if (!story || epic?.engagement_id !== ctx.engagementId) return { content: `Ticket "${id}" is not in the active engagement.`, is_error: true };
    const jira = await jiraForStory(id);
    if (!jira) return { content: "Jira isn't wired for this engagement — nothing posted.", is_error: true };
    const ok = await addComment(jira, id, text);
    return ok ? { content: `Comment posted on ${id}.` } : { content: `Couldn't post the comment on ${id}.`, is_error: true };
  },
};

const fileQuestion: ToolDef = {
  name: "file_question", write: true,
  spec: {
    name: "file_question",
    description: "File a structured clarifying question into the current role's jobs-to-do when you cannot resolve a gap from state — instead of guessing. The human answers it later; the answer patches an allowlisted target.",
    input_schema: { type: "object", properties: {
      key: { type: "string", description: "stable short id, e.g. 'budget'" },
      prompt: { type: "string", description: "the question shown to the human" },
      type: { type: "string", enum: ["choice", "number", "text"] },
      options: { type: "array", items: { type: "string" }, description: "choice type only" },
      target_table: { type: "string" }, target_id: { type: "string" }, target_column: { type: "string" },
      because: { type: "string", description: "the gap/inference that drove the ask" },
    }, required: ["key", "prompt", "type", "target_table", "target_id", "target_column"] },
  },
  run: async (input, ctx) => {
    const target: QuestionTarget = { table: str(input.target_table), id: str(input.target_id), column: str(input.target_column) };
    const n = await raiseQuestions(ctx.sb, { engagementId: ctx.engagementId, role: ctx.role, source: "assistant" }, [{
      key: str(input.key), prompt: str(input.prompt), type: (str(input.type) || "text") as QuestionType,
      options: Array.isArray(input.options) ? (input.options as string[]) : undefined,
      target, because: str(input.because) || undefined,
    }]);
    return n ? { content: `Filed a question for the ${ctx.role} to answer.` } : { content: "Couldn't file the question (target may be off the allowlist).", is_error: true };
  },
};

const rerunWorkflow: ToolDef = {
  name: "rerun_workflow", write: true,
  spec: {
    name: "rerun_workflow",
    description: "Re-execute the real orchestrator for a ticket — a build or fix run against its resolved repo. The live log streams to the user; on green it opens/links a PR and gates for review. Use only after diagnosing the failure.",
    input_schema: { type: "object", properties: {
      story_id: { type: "string" },
      workflow: { type: "string", enum: ["build", "fix"], description: "'fix' for a bug/regression, 'build' to implement" },
    }, required: ["story_id", "workflow"] },
  },
  run: async (input, ctx, emit) => {
    const id = str(input.story_id);
    const workflow = (str(input.workflow) === "fix" ? "fix" : "build") as "build" | "fix";
    // scope guard
    const { data: story } = await ctx.sb.from("story").select("epic_id").eq("id", id).maybeSingle();
    const { data: epic } = story?.epic_id ? await ctx.sb.from("epic").select("engagement_id").eq("id", story.epic_id).maybeSingle() : { data: null };
    if (!story || epic?.engagement_id !== ctx.engagementId) return { content: `Ticket "${id}" is not in the active engagement.`, is_error: true };
    const { code } = await runOrchestrator({ storyKey: id, workflow, emit });
    return code === 0
      ? { content: `Run finished green (exit 0). A PR was opened/linked and the ticket is Awaiting HITL approval.` }
      : { content: `Run failed (exit ${code}). See the log above; diagnose before another attempt.`, is_error: true };
  },
};

// ── Registry ─────────────────────────────────────────────────────────────────

const TOOLS: ToolDef[] = [
  getTicket, getRunLog, listStories, getEngagementState,   // read
  transitionTicket, patchField, postComment, fileQuestion, rerunWorkflow,  // write
];
const BY_NAME: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

// The tool specs handed to the model (Anthropic tool schema shape).
export const TOOL_SPECS = TOOLS.map((t) => t.spec);

export function isWriteTool(name: string): boolean { return Boolean(BY_NAME[name]?.write); }
export function toolExists(name: string): boolean { return Boolean(BY_NAME[name]); }

// A tool the model requested is a WRITE that streams live output (only rerun_workflow today).
export function isStreamingTool(name: string): boolean { return name === "rerun_workflow"; }

// Execute one tool call. Read tools run inline; write tools should only reach here AFTER the human
// confirmed. `sb` is required — callers resolve it once and pass the context.
export async function execTool(name: string, input: Record<string, unknown>, ctx: ToolContext, emit: Emit): Promise<ToolResult> {
  const def = BY_NAME[name];
  if (!def) return { content: `Unknown tool "${name}".`, is_error: true };
  try {
    return await def.run(input, ctx, emit);
  } catch (e) {
    return { content: `Tool "${name}" errored: ${e instanceof Error ? e.message : String(e)}`, is_error: true };
  }
}

// A friendly one-line preview of a pending write, shown on the confirmation card.
export function describeToolCall(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "transition_ticket": return `Move ${str(input.story_id)} → ${str(input.to_status)}`;
    case "patch_field": return `Set ${str(input.table)}.${str(input.column)} on ${str(input.id)} = "${str(input.value)}"`;
    case "post_comment": return `Comment on ${str(input.story_id)}: "${str(input.text).slice(0, 80)}${str(input.text).length > 80 ? "…" : ""}"`;
    case "file_question": return `File a question for the current role: "${str(input.prompt).slice(0, 80)}"`;
    case "rerun_workflow": return `Re-execute the ${str(input.workflow) || "build"} orchestrator for ${str(input.story_id)}`;
    default: return `${name}(${JSON.stringify(input).slice(0, 100)})`;
  }
}

// Convenience for API routes: build a context from an engagement + role.
export function toolContext(engagementId: string, role: string, anchor?: ToolContext["anchor"]): ToolContext | null {
  const sb = supabaseAdmin();
  if (!sb) return null;
  return { sb, engagementId, role, anchor: anchor ?? null };
}
