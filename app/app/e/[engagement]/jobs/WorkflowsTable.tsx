"use client";

// Every workflow this role owns, flat — one row per `workflow_run` (or, before it exists, one row
// per the task that would open it), no matter how many hops of nesting or how many fan-out copies.
// Replaces `PhaseStarter` (a top-level "Initiate X") and the old accordion (a nesting row's
// children rendered inline) with one shape: a workflow is a row in THIS table, full stop.
//
// See `workflows-view.ts` for why "available" and "open" read ownership off different fields.

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { WorkflowCard } from "@/app/lib/data/workflows-view";
import { initiatePhaseAction, startWorkflowAction } from "./actions";

/**
 * What the run is doing, read from the event log while it does it — ported from `PhaseStarter`
 * unchanged. Opening a workflow can take the better part of a minute (probing Confluence/Jira,
 * filing tickets), and a button that greys out and says nothing that long is indistinguishable
 * from a hang.
 */
function useProgress(engagement: string, role: string, active: boolean) {
  const [line, setLine] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const since = useRef<string>("");

  const reset = () => {
    setLine(null);
    setSeconds(0);
  };

  useEffect(() => {
    if (!active) return;
    since.current = new Date(Date.now() - 2000).toISOString();
    const started = Date.now();
    let alive = true;

    const tick = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    const poll = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/progress?engagement=${encodeURIComponent(engagement)}` +
            `&role=${encodeURIComponent(role)}&since=${encodeURIComponent(since.current)}`,
          { cache: "no-store" },
        );
        if (!res.ok || !alive) return;
        const { lines } = (await res.json()) as { lines: { at: string; line: string }[] };
        if (!lines?.length || !alive) return;
        const last = lines[lines.length - 1];
        setLine(last.line);
        since.current = last.at;
      } catch {
        // A failed poll is not a failed run. Say nothing and try again.
      }
    }, 1200);

    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [active, engagement, role]);

  return { line, seconds, reset };
}

export function WorkflowsTable({
  engagement,
  role,
  workflows,
}: {
  engagement: string;
  role: string;
  workflows: WorkflowCard[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { line, seconds, reset } = useProgress(engagement, role, busy !== null);

  if (!workflows.length) return null;

  async function open(w: WorkflowCard) {
    setErrors((e) => ({ ...e, [w.key]: "" }));
    reset();
    setBusy(w.key);
    try {
      const r = w.taskId
        ? await startWorkflowAction(engagement, role, w.taskId)
        : await initiatePhaseAction(engagement, role, w.code);
      if (!r.ok) {
        setErrors((e) => ({ ...e, [w.key]: r.error ?? `Could not open ${w.label}.` }));
        return;
      }
      // STAYS ON THE QUEUE, deliberately — the whole point of this table is that opening a
      // workflow becomes a row you can see progress on, not a jump straight into one task inside
      // it. `startWorkflowAction`/`startedTaskId` still auto-starts its first same-role task
      // server-side (see `openNested`), so nothing about that convenience is lost — it just shows
      // up as a "started" row in the Tasks table below, for the person to click themselves, rather
      // than yanking their browser there for them.
      router.refresh();
    } catch {
      setErrors((e) => ({ ...e, [w.key]: `Could not open ${w.label}. The request did not complete.` }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="queue-table-scroll workflows-table-wrap">
      <h3 className="phases-head">Workflows you own</h3>
      <table className="queue-table">
        <colgroup>
          <col className="col-title" />
          <col className="col-gate" />
          <col className="col-action" />
        </colgroup>
        <thead>
          <tr>
            <th>Workflow</th>
            <th className="center">Progress</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {workflows.map((w) => (
            <tr key={w.key} className="row">
              <td className="cell-title">
                <div className="title-cell">
                  <span className="title">{w.label}</span>
                </div>
              </td>
              <td className="cell-gate center" data-label="Progress">
                {w.state === "available" ? (
                  <span className="text-muted">not started</span>
                ) : (
                  <span className="text-muted">
                    {w.closedCount} of {w.totalCount} closed
                  </span>
                )}
              </td>
              <td className="cell-action">
                {w.state === "available" ? (
                  <div className="start-control">
                    <button
                      className="btn btn-primary btn-compact"
                      disabled={busy !== null}
                      onClick={() => open(w)}
                    >
                      {busy === w.key ? "Opening…" : `Open ${w.label}`}
                    </button>
                    {busy === w.key && (
                      <p className="phases-progress" aria-live="polite">
                        <span className="phases-progress-line">{line ?? "Working…"}</span>
                        <span className="phases-progress-elapsed">{seconds}s</span>
                      </p>
                    )}
                    {errors[w.key] && <pre className="phases-error">{errors[w.key]}</pre>}
                  </div>
                ) : (
                  <span className="text-muted">{w.state === "closed" ? "closed" : "in progress"}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
