"use client";

// Asking the agent to work, from anywhere that should cause it.
//
// Shared rather than duplicated because two places now trigger a run — the Run button, and
// answering the last open question — and they must report the outcome identically.
//
// The route answers "accepted", not the run's outcome: a run takes minutes and is detached from the
// request (see `/api/agent/run`), so there is nothing to report here beyond "it started" or "it
// could not be started". What the run actually did — asked, drafted, declined, failed — lands in
// the task's own rows, and the page reads it from there (heartbeat-driven running/stalled state plus
// the realtime refresh), the same way whether this tab or a different one made the request.

import { readEnvelope, describeFailure } from "@/app/lib/envelope";

export type RunOutcome = { ok: boolean; message: string };

export async function requestRun(
  engagement: string, role: string, taskId: string, holderId?: string | null,
): Promise<RunOutcome> {
  try {
    const res = await fetch("/api/agent/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engagement, role, taskId, holderId }),
    });
    const d = await readEnvelope<{ kind: "accepted"; taskId: string }>(res);
    if (!d.ok) return { ok: false, message: describeFailure(d) };
    return { ok: true, message: "Started — this page updates when the agent replies." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
