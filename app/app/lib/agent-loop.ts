import Anthropic from "@anthropic-ai/sdk";
import { COMPASS_ROLES } from "./data";
import {
  TOOL_SPECS, execTool, isWriteTool, isStreamingTool, describeToolCall,
  type ToolContext, type Emit,
} from "./agent-tools";
import {
  appendMessage, ensureTitle, getMessages, toApiMessages,
  type ChatThread, type ChatRow,
} from "./agent-thread";

// ── The streaming agent tool loop ────────────────────────────────────────────
// One request drives the loop until the model finishes OR asks for a WRITE that needs confirmation.
// Read tools run inline; write tools pause the loop with a `confirm` event and resume on the next
// request. Cost is bounded: prompt caching on the system + tool prefix, capped tokens/iterations,
// and a trimmed history window. The client speaks NDJSON — one JSON AgentEvent per line.

export type AgentEvent =
  | { type: "thread"; id: string }                                                    // the (possibly new) thread id
  | { type: "text"; delta: string }                                                   // visible assistant text
  | { type: "tool"; name: string; phase: "start" | "done" | "error"; summary?: string } // read/write activity chip
  | { type: "exec"; chunk: string }                                                   // live orchestrator output (rerun)
  | { type: "confirm"; toolUseId: string; name: string; input: unknown; summary: string } // pause: awaiting approval
  | { type: "done" }
  | { type: "error"; message: string };

export type TurnInput = { message?: string; confirm?: { toolUseId: string; approved: boolean } };

const MAX_ITERS = 8;       // tool round-trips before we force a pause (runaway backstop)
const MAX_TOKENS = 1024;   // per assistant turn
const MAX_HISTORY = 50;    // rows fed to the model (older turns trimmed at a human boundary)

const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

// The unresolved tool_use calls from the most recent assistant turn (those still lacking a
// tool_result). Fully derived from stored rows, so a resumed request needs no server-side state.
function pendingToolCalls(rows: ChatRow[]): { id: string; name: string; input: Record<string, unknown> }[] {
  let idx = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].author === "assistant" && (rows[i].tool_calls?.length ?? 0) > 0) { idx = i; break; }
    if (rows[i].author === "assistant") return []; // an assistant turn with no tools → nothing pending
  }
  if (idx < 0) return [];
  const resolved = new Set<string>();
  for (let i = idx + 1; i < rows.length; i++) { const tr = rows[i].tool_result; if (tr) resolved.add(tr.tool_use_id); }
  return (rows[idx].tool_calls ?? [])
    .filter((c) => !resolved.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, input: (c.input ?? {}) as Record<string, unknown> }));
}

// Keep the context bounded — start the window at a human turn so tool_use/tool_result pairs stay intact.
function trimRows(rows: ChatRow[]): ChatRow[] {
  if (rows.length <= MAX_HISTORY) return rows;
  let start = rows.length - MAX_HISTORY;
  while (start < rows.length && rows[start].author !== "human") start++;
  return start < rows.length ? rows.slice(start) : rows.slice(-MAX_HISTORY);
}

function readSummary(name: string, input: Record<string, unknown>): string {
  const v = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  if (name === "get_ticket") return `Reading ${v("story_id")}`;
  if (name === "get_run_log") return `Reading run ${v("run_id") || "(anchored)"}`;
  if (name === "list_stories") return "Listing tickets";
  if (name === "get_engagement_state") return "Reading engagement state";
  return name;
}

async function groundingBlock(ctx: ToolContext): Promise<string> {
  const a = ctx.anchor;
  if (a && a.kind === "ticket" && a.id) {
    const r = await execTool("get_ticket", { story_id: a.id }, ctx, () => {});
    return `This thread is anchored to ticket ${a.id}. Current state:\n${r.content}`;
  }
  if (a && a.kind === "run" && a.id) {
    const r = await execTool("get_run_log", { run_id: a.id }, ctx, () => {});
    return `This thread is anchored to run ${a.id}. Current state:\n${r.content}`;
  }
  const { data: eng } = await ctx.sb.from("engagement").select("name, phase").eq("id", ctx.engagementId).maybeSingle();
  const jobLine = a && a.kind === "job" && a.id ? ` This thread was opened from job ${a.id}.` : "";
  return eng ? `Active engagement: ${eng.name} (phase: ${eng.phase}).${jobLine}` : "";
}

async function buildSystem(ctx: ToolContext): Promise<Anthropic.TextBlockParam[]> {
  const roleLabel = COMPASS_ROLES.find((r) => r.code === ctx.role)?.label ?? ctx.role;
  const base = `You are Compass Execution Help — an agentic assistant for the ${roleLabel} on a software-delivery program run on the Compass platform.
Your job is to help this role RESOLVE issues on their tasks: diagnose from real state, then either advise or take an allowlisted action.

Operating rules:
- Ground every claim in tool reads. Never invent ticket ids, statuses, errors, or run output — call a read tool (get_ticket, get_run_log, list_stories, get_engagement_state) first.
- You are scoped to the ACTIVE engagement only. Never reference or touch another engagement.
- Read tools run automatically. For a write (transition_ticket, patch_field, post_comment, file_question, rerun_workflow), CALL THE TOOL directly once you've decided on it — do NOT ask for permission in prose first. The system automatically shows the user a confirmation card for every write and executes it only if they approve, so your tool call is already gated. Asking "shall I?" in text just wastes a round-trip. If the user declines, don't retry it — suggest an alternative or ask.
- Prefer the smallest safe action. Re-run the orchestrator only after you have actually diagnosed the failure.
- When you can't resolve a gap from state, file_question instead of guessing or defaulting.
- Be concise and concrete: the root cause (not the symptom) and the single next move. No preamble, no greeting.`;
  const grounding = await groundingBlock(ctx);
  const blocks: Anthropic.TextBlockParam[] = [{ type: "text", text: base }];
  if (grounding) blocks.push({ type: "text", text: grounding });
  blocks[blocks.length - 1].cache_control = { type: "ephemeral" }; // cache the whole system prefix
  return blocks;
}

function cachedTools(): Anthropic.Tool[] {
  const tools = TOOL_SPECS.map((t) => ({ ...t })) as Anthropic.Tool[];
  if (tools.length) tools[tools.length - 1].cache_control = { type: "ephemeral" }; // cache tool defs too
  return tools;
}

async function streamAssistant(
  client: Anthropic,
  params: { system: Anthropic.TextBlockParam[]; tools: Anthropic.Tool[]; messages: Anthropic.MessageParam[] },
  send: (e: AgentEvent) => void,
): Promise<{ text: string; toolUses: { id: string; name: string; input: unknown }[] }> {
  const stream = client.messages.stream({
    model: MODEL(), max_tokens: MAX_TOKENS,
    system: params.system, tools: params.tools, messages: params.messages,
  });
  stream.on("text", (t) => send({ type: "text", delta: t }));
  const final = await stream.finalMessage();
  let text = "";
  const toolUses: { id: string; name: string; input: unknown }[] = [];
  for (const b of final.content) {
    if (b.type === "text") text += b.text;
    else if (b.type === "tool_use") toolUses.push({ id: b.id, name: b.name, input: b.input });
  }
  return { text, toolUses };
}

// Resolve ONE confirmed/declined write: execute it (streaming for rerun) or record the decline,
// then append its tool_result so the loop can continue.
async function resolveConfirm(ctx: ToolContext, threadId: string, confirm: NonNullable<TurnInput["confirm"]>, send: (e: AgentEvent) => void): Promise<void> {
  const rows = await getMessages(ctx.sb, threadId);
  const call = pendingToolCalls(rows).find((p) => p.id === confirm.toolUseId);
  if (!call) return; // already resolved or unknown — ignore
  if (!confirm.approved) {
    await appendMessage(ctx.sb, threadId, { author: "tool", tool_result: { tool_use_id: call.id, content: "The user declined this action. Do not retry it; propose an alternative or ask what they'd prefer.", is_error: false } });
    send({ type: "tool", name: call.name, phase: "done", summary: "declined" });
    return;
  }
  send({ type: "tool", name: call.name, phase: "start", summary: describeToolCall(call.name, call.input) });
  const emit: Emit = isStreamingTool(call.name) ? (s) => send({ type: "exec", chunk: s }) : () => {};
  const res = await execTool(call.name, call.input, ctx, emit);
  await appendMessage(ctx.sb, threadId, { author: "tool", tool_result: { tool_use_id: call.id, content: res.content, is_error: res.is_error } });
  send({ type: "tool", name: call.name, phase: res.is_error ? "error" : "done", summary: res.content.slice(0, 140) });
}

// Drive a whole turn. Appends the human message and/or resolves a confirmation, then loops: resolve
// pending reads inline, pause on the first pending write, otherwise call the model for the next turn.
export async function runAgentTurn(opts: { thread: ChatThread; ctx: ToolContext; input: TurnInput; send: (e: AgentEvent) => void }): Promise<void> {
  const { thread, ctx, input, send } = opts;
  const sb = ctx.sb;

  if (input.message) {
    await appendMessage(sb, thread.id, { author: "human", content: input.message });
    await ensureTitle(sb, thread, input.message);
  }
  if (input.confirm) await resolveConfirm(ctx, thread.id, input.confirm, send);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { send({ type: "error", message: "Live assistant is off — set ANTHROPIC_API_KEY in the app env." }); send({ type: "done" }); return; }

  const client = new Anthropic({ apiKey: key });
  const system = await buildSystem(ctx);
  const tools = cachedTools();

  try {
    for (let iter = 0; iter < MAX_ITERS; iter++) {
      const rows = await getMessages(sb, thread.id);
      const pending = pendingToolCalls(rows);

      if (pending.length) {
        for (const p of pending) {
          if (isWriteTool(p.name)) {
            // pause — the client shows a confirm card and re-POSTs with an approve/deny
            send({ type: "confirm", toolUseId: p.id, name: p.name, input: p.input, summary: describeToolCall(p.name, p.input) });
            send({ type: "done" });
            return;
          }
          send({ type: "tool", name: p.name, phase: "start", summary: readSummary(p.name, p.input) });
          const res = await execTool(p.name, p.input, ctx, () => {});
          await appendMessage(sb, thread.id, { author: "tool", tool_result: { tool_use_id: p.id, content: res.content, is_error: res.is_error } });
          send({ type: "tool", name: p.name, phase: res.is_error ? "error" : "done" });
        }
        continue; // reads resolved → next iteration calls the model
      }

      const assistant = await streamAssistant(client, { system, tools, messages: toApiMessages(trimRows(rows)) }, send);
      await appendMessage(sb, thread.id, { author: "assistant", content: assistant.text || null, tool_calls: assistant.toolUses.length ? assistant.toolUses : null });
      if (!assistant.toolUses.length) { send({ type: "done" }); return; }
      // next iteration resolves the requested tool calls
    }
    send({ type: "error", message: "Reached the tool-iteration limit for one turn. Ask me to continue if needed." });
    send({ type: "done" });
  } catch (e) {
    send({ type: "error", message: e instanceof Error ? e.message : String(e) });
    send({ type: "done" });
  }
}
