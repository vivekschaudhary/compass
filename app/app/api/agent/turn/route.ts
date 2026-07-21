import { supabaseAdmin } from "@/app/lib/supabase";
import { toolContext } from "@/app/lib/agent-tools";
import { runAgentTurn, type AgentEvent, type TurnInput } from "@/app/lib/agent-loop";
import { createThread, getThread, type Anchor } from "@/app/lib/agent-thread";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The agentic Execution-Help turn endpoint. One POST either:
//   • starts/continues a conversation with a new user message, or
//   • resumes a paused write with an approve/deny.
// It streams NDJSON AgentEvents (one JSON object per line) — text deltas, tool activity, a live
// orchestrator log, a `confirm` pause, and a final `done`. See app/lib/agent-loop.ts.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    threadId?: string;
    engagementId?: string;
    role?: string;
    anchor?: Anchor;
    message?: string;
    confirm?: { toolUseId: string; approved: boolean };
  };

  const enc = new TextEncoder();
  const err = (message: string) =>
    new Response(new ReadableStream({
      start(c) { c.enqueue(enc.encode(JSON.stringify({ type: "error", message }) + "\n")); c.enqueue(enc.encode(JSON.stringify({ type: "done" }) + "\n")); c.close(); },
    }), { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });

  const sb = supabaseAdmin();
  if (!sb) return err("Supabase isn't configured — the assistant needs a database to persist the conversation.");

  // Resolve (or create) the thread. A new conversation with no threadId is created on the fly.
  let thread = body.threadId ? await getThread(sb, body.threadId) : null;
  if (!thread) {
    if (!body.engagementId || !body.role) return err("Missing engagementId/role to start a thread.");
    thread = await createThread(sb, { engagementId: body.engagementId, role: body.role, anchor: body.anchor });
    if (!thread) return err("Couldn't create the conversation thread.");
  }

  const ctx = toolContext(thread.engagement_id, thread.role,
    thread.anchor_kind && thread.anchor_kind !== "none" ? { kind: thread.anchor_kind, id: thread.anchor_id ?? "" } : null);
  if (!ctx) return err("Supabase isn't configured.");

  const threadId = thread.id;
  const input: TurnInput = { message: body.message, confirm: body.confirm };

  const stream = new ReadableStream({
    async start(c) {
      const send = (e: AgentEvent) => c.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      // hand the thread id back first so the client can persist/rehydrate a freshly-created thread
      send({ type: "thread", id: threadId });
      await runAgentTurn({ thread: thread!, ctx, input, send });
      c.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
