"use client";

// Asking the agent to work, from anywhere that should cause it.
//
// Shared rather than duplicated because two places now trigger a run — the Run button, and
// answering the last open question — and they must report the outcome identically. A run takes
// minutes and goes through the API route rather than a server action for that reason.

export type RunOutcome = { ok: boolean; message: string };

export async function requestRun(
  engagement: string, role: string, taskId: string,
): Promise<RunOutcome> {
  try {
    const res = await fetch("/api/v2/agent/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engagement, role, taskId }),
    });
    const d = await res.json();
    return {
      ok: d.kind === "asked" || d.kind === "drafted",
      message:
        d.kind === "asked" ? `Asked ${d.questions?.length ?? 0} question(s).`
        : d.kind === "drafted" ? `Drafted ${d.sections} section(s) into ${d.path}.`
        : d.kind === "refused" ? `The model declined: ${d.reason}`
        : d.error ?? d.message ?? "Something went wrong.",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
