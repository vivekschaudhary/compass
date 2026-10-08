// Tell a task's open page that its run has ended.
//
// The page cannot be trusted to poll its way to the end of a run: a poll that overlaps a slow render
// misses the change, and the page then sits on "working" with a finished draft behind it. So the
// server says so directly, on the task's own channel, the moment the run returns.
//
// Sent with the service role from the server, so it does not depend on what the browser may read
// (row-level security applies to the browser's postgres_changes subscription, not to this).
// Best-effort: a failed notice is logged, never thrown, because the run itself has already finished
// and written its own record.

import "server-only";
import { supabaseAdmin } from "../supabase";

const TIMEOUT_MS = 5_000;

export async function notifyRunEnded(taskId: string): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  const channel = sb.channel(`task-${taskId}`);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("subscribe timed out")), TIMEOUT_MS);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(); }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timer); reject(new Error(status)); }
      });
    });
    await channel.send({ type: "broadcast", event: "run-ended", payload: { taskId } });
  } catch (e) {
    console.error(`[agent-run] could not notify task=${taskId}: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await sb.removeChannel(channel);
  }
}
