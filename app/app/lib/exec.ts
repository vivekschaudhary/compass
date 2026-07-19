import { supabaseAdmin } from "./supabase";
import { logActivity } from "./activity";

// A streamed, step-logged execution — the shared spine behind every AI action. The body emits
// granular steps via step(); this streams them live to the client, persists the full log as a
// `run` row, links an `activity` history entry to it (run_id), and emits a final `[[result]]<json>`
// sentinel carrying the structured result. Mirrors what /api/build already does for orchestrator runs.
export type ExecMeta = {
  engagementId: string;
  role: string;         // roleCode that owns the action
  kind: string;         // activity/run kind: research | refine | bet | story | triage | sprint-review …
  actor?: string;
  persist?: boolean;    // default true; false = stream only (e.g. a preview/propose), no run/history row
  related?: string;     // ticket/deep-link known up front — kept on FAILURE so a failed run still links
  title?: string;       // fallback history title used when the body throws before returning one
};
export type ExecOutcome = {
  result?: unknown;     // structured result → the [[result]] sentinel for the client
  title: string;        // history/activity title
  related?: string;     // jira key / epic / url — the "task #" + deep link
  status?: "done" | "failed" | "filed";
};

export function streamExecution(meta: ExecMeta, body: (step: (s: string) => void) => Promise<ExecOutcome>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      let log = "";
      const step = (s: string) => { const line = s.endsWith("\n") ? s : s + "\n"; log += line; c.enqueue(enc.encode(line)); };

      // seed with the up-front fallbacks so a FAILED run still carries the ticket + a real title
      let outcome: ExecOutcome = { title: meta.title ?? meta.kind, related: meta.related };
      let ok = true;
      try {
        outcome = await body(step);
        step(`\n[done]`);
      } catch (e) {
        ok = false;
        step(`\n[error: ${e instanceof Error ? e.message : String(e)}]\n[done]`);
      }

      const status = outcome.status ?? (ok ? "done" : "failed");
      const runId = `${meta.kind}-${(outcome.related ?? "x").replace(/[^A-Za-z0-9-]/g, "").slice(0, 24)}-${Date.now().toString(36)}`;
      const sb = supabaseAdmin();
      if (sb && meta.persist !== false) {
        try {
          await sb.from("run").insert({
            id: runId, engagement_id: meta.engagementId, role: meta.role, story: outcome.related ?? null,
            workflow: meta.kind, status: status === "failed" ? "failed" : "resolved",
            error: ok ? null : "exec failed", log, created_at: new Date().toISOString(),
          });
          await logActivity(sb, { engagementId: meta.engagementId, role: meta.role, actor: meta.actor, kind: meta.kind, title: outcome.title, related: outcome.related, status, runId });
        } catch { /* persistence best-effort */ }
      }

      c.enqueue(enc.encode(`\n[[result]]${JSON.stringify(ok ? (outcome.result ?? {}) : { error: "failed" })}`));
      c.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
