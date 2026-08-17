"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveAction, rejectAction } from "./actions";

export type DoneCriterion = { id: string; statement: string; satisfied: boolean | null };

type Verdict = "none" | "ok" | "no";

/**
 * Reviewing, one criterion at a time, in both directions.
 *
 * Three states per row, and the third is the one that was missing: confirmed, rejected with a
 * reason, or untouched. Untouched is not a soft no — it means nobody looked, and it reads that way
 * in the record. A rejection is someone reading the work and saying what is wrong, which is the
 * most useful thing the agent can be told and previously had no way of reaching it.
 *
 * A rejection without a reason is refused. The agent has to act on it, and "no" is not actionable.
 */
export function ApprovePanel({ engagement, role, taskId, criteria }: {
  engagement: string; role: string; taskId: string; criteria: DoneCriterion[];
}) {
  const router = useRouter();
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>(
    () => Object.fromEntries(criteria.map((c) => [c.id, c.satisfied ? "ok" : "none"])),
  );
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (id: string, v: Verdict) => setVerdicts((p) => ({ ...p, [id]: p[id] === v ? "none" : v }));
  const confirmed = criteria.filter((c) => verdicts[c.id] === "ok");
  const rejected = criteria.filter((c) => verdicts[c.id] === "no");
  const allOk = confirmed.length === criteria.length;

  return (
    <div className={rejected.length ? "approve approve-sending-back" : "approve"}>
      <div className="approve-head">
        {rejected.length
          ? "Sending back — say what is wrong with each"
          : "Approve — confirm each one. You are the evidence for these."}
      </div>

      {criteria.map((c) => {
        const v = verdicts[c.id] ?? "none";
        return (
          <div key={c.id} className={`verdict verdict-${v}`}>
            <div className="verdict-row">
              <div className="verdict-marks">
                <button
                  className={v === "ok" ? "vmark vmark-ok vmark-on" : "vmark vmark-ok"}
                  onClick={() => set(c.id, "ok")} title="Confirm"
                  aria-label={`Confirm: ${c.statement}`}
                >✓</button>
                <button
                  className={v === "no" ? "vmark vmark-no vmark-on" : "vmark vmark-no"}
                  onClick={() => set(c.id, "no")} title="Reject"
                  aria-label={`Reject: ${c.statement}`}
                >✗</button>
              </div>
              <span className="verdict-text">{c.statement}</span>
            </div>
            {v === "no" && (
              <textarea
                className="input verdict-reason" rows={2}
                placeholder="What is wrong with it? The agent works from this."
                value={reasons[c.id] ?? ""}
                onChange={(e) => setReasons((p) => ({ ...p, [c.id]: e.target.value }))}
              />
            )}
          </div>
        );
      })}

      <div className="approve-actions">
        {rejected.length > 0 ? (
          <button
            className="btn btn-primary" disabled={pending}
            onClick={() => startTransition(async () => {
              setError(null);
              const r = await rejectAction(engagement, role, taskId,
                rejected.map((c) => ({ criterionId: c.id, reason: reasons[c.id] ?? "" })));
              if (!r.ok) setError(r.error ?? "Could not send it back.");
              else router.refresh();
            })}
          >
            {pending ? "Sending…" : `Send back — ${rejected.length} rejected`}
          </button>
        ) : (
          <button
            className="btn btn-primary" disabled={pending || confirmed.length === 0}
            onClick={() => startTransition(async () => {
              setError(null);
              const r = await approveAction(engagement, role, taskId, confirmed.map((c) => c.id));
              if (!r.ok) setError(r.error ?? "Could not approve.");
              else router.refresh();
            })}
          >
            {pending ? "Recording…" : allOk ? "Approve and close" : `Confirm ${confirmed.length} of ${criteria.length}`}
          </button>
        )}
        <span className="text-muted approve-note">
          {rejected.length
            ? "The agent reads your reasons and revises — it keeps what you did not object to."
            : allOk ? "Every criterion confirmed." : `${criteria.length - confirmed.length} untouched — nobody looked at these yet.`}
        </span>
        {error && <span className="start-error">{error}</span>}
      </div>
    </div>
  );
}
