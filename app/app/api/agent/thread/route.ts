import { supabaseAdmin } from "@/app/lib/supabase";
import { getThread, getMessages } from "@/app/lib/agent-thread";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A display bubble for the dock transcript when a saved thread is reopened.
type Bubble =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; ok: boolean; summary: string };

// Hydrate a saved conversation: the thread meta + a flattened, render-ready transcript.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const sb = supabaseAdmin();
  if (!sb || !id) return Response.json({ thread: null, bubbles: [] });

  const thread = await getThread(sb, id);
  if (!thread) return Response.json({ thread: null, bubbles: [] });

  const rows = await getMessages(sb, id);
  const nameById = new Map<string, string>();     // tool_use_id → tool name (for resolved tool chips)
  for (const r of rows) for (const tc of r.tool_calls ?? []) nameById.set(tc.id, tc.name);

  const bubbles: Bubble[] = [];
  for (const r of rows) {
    if (r.author === "human" && r.content) bubbles.push({ kind: "user", text: r.content });
    else if (r.author === "assistant" && r.content) bubbles.push({ kind: "assistant", text: r.content });
    else if (r.author === "tool" && r.tool_result) {
      const name = nameById.get(r.tool_result.tool_use_id) ?? "tool";
      bubbles.push({ kind: "tool", name, ok: !r.tool_result.is_error, summary: (r.tool_result.content ?? "").slice(0, 140) });
    }
  }
  return Response.json({ thread, bubbles });
}
