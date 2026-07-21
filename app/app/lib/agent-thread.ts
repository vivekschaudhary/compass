import type { SupabaseClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";

// ── Thread + message persistence for the agentic assistant ───────────────────
// A thread is one conversation (free-form or anchored to a ticket/run/job) owned by a role lens.
// Messages are stored one row per logical turn and rebuilt into the Anthropic messages[] on resume.

export type Anchor = { kind: "ticket" | "run" | "job" | "none"; id?: string };

export type ChatThread = {
  id: string; engagement_id: string; role: string;
  anchor_kind: string; anchor_id: string | null; title: string | null;
  created_at: string; updated_at: string;
};

// One persisted turn. tool_calls carries an assistant turn's tool_use blocks; tool_result carries a
// tool turn's result — the two jsonb columns let us reconstruct the exact API message shape.
export type ChatRow = {
  id: number; thread_id: string; author: "human" | "assistant" | "tool";
  content: string | null;
  tool_calls: { id: string; name: string; input: unknown }[] | null;
  tool_result: { tool_use_id: string; content: string; is_error?: boolean } | null;
  created_at: string;
};

type Sb = SupabaseClient;

function genId(prefix: string): string {
  // no Date.now()/random in this codebase's server would matter; here it's a normal Node route.
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export async function createThread(sb: Sb, opts: { engagementId: string; role: string; anchor?: Anchor; title?: string }): Promise<ChatThread | null> {
  const row = {
    id: genId("th"), engagement_id: opts.engagementId, role: opts.role,
    anchor_kind: opts.anchor?.kind ?? "none", anchor_id: opts.anchor?.id ?? null,
    title: opts.title ?? null,
  };
  const { data, error } = await sb.from("chat_thread").insert(row).select().maybeSingle();
  return error ? null : (data as ChatThread);
}

export async function getThread(sb: Sb, id: string): Promise<ChatThread | null> {
  const { data } = await sb.from("chat_thread").select("*").eq("id", id).maybeSingle();
  return (data as ChatThread) ?? null;
}

export async function listThreads(sb: Sb, engagementId: string, role: string): Promise<ChatThread[]> {
  const { data } = await sb.from("chat_thread").select("*")
    .eq("engagement_id", engagementId).eq("role", role)
    .order("updated_at", { ascending: false }).limit(50);
  return (data as ChatThread[]) ?? [];
}

export async function getMessages(sb: Sb, threadId: string): Promise<ChatRow[]> {
  const { data } = await sb.from("chat_message").select("*")
    .eq("thread_id", threadId).order("created_at", { ascending: true }).order("id", { ascending: true });
  return (data as ChatRow[]) ?? [];
}

export async function appendMessage(sb: Sb, threadId: string, msg: Partial<ChatRow> & { author: ChatRow["author"] }): Promise<void> {
  await sb.from("chat_message").insert({
    thread_id: threadId, author: msg.author,
    content: msg.content ?? null, tool_calls: msg.tool_calls ?? null, tool_result: msg.tool_result ?? null,
  });
  await sb.from("chat_thread").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
}

// Give a new thread a title from its first human message (once), so the thread list is scannable.
export async function ensureTitle(sb: Sb, thread: ChatThread, firstMessage: string): Promise<void> {
  if (thread.title) return;
  const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
  await sb.from("chat_thread").update({ title }).eq("id", thread.id);
}

// Rebuild the Anthropic messages[] from stored rows. Consecutive `tool` rows collapse into one
// user message carrying multiple tool_result blocks (the API groups them per turn).
export function toApiMessages(rows: ChatRow[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const r of rows) {
    if (r.author === "human") {
      out.push({ role: "user", content: r.content ?? "" });
    } else if (r.author === "assistant") {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (r.content) blocks.push({ type: "text", text: r.content });
      for (const tc of r.tool_calls ?? []) blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: (tc.input ?? {}) as Record<string, unknown> });
      out.push({ role: "assistant", content: blocks.length ? blocks : "" });
    } else if (r.author === "tool" && r.tool_result) {
      const block: Anthropic.ToolResultBlockParam = {
        type: "tool_result", tool_use_id: r.tool_result.tool_use_id,
        content: r.tool_result.content, is_error: r.tool_result.is_error,
      };
      const last = out[out.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) last.content.push(block);
      else out.push({ role: "user", content: [block] });
    }
  }
  return out;
}
