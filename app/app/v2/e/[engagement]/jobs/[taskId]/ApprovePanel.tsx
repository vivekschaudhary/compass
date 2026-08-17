"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveAction } from "./actions";

export type DoneCriterion = { id: string; statement: string; satisfied: boolean | null };

/**
 * Approving, one criterion at a time.
 *
 * Each tick is an attestation recorded with the person's name — not a checkbox that unlocks a
 * button. Leaving one unticked is a real state: it stays unmeasured and the close is refused,
 * so nobody has to remember what they skipped.
 */
export function ApprovePanel({ engagement, role, taskId, criteria }: {
  engagement: string; role: string; taskId: string; criteria: DoneCriterion[];
}) {
  const router = useRouter();
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(criteria.filter((c) => c.satisfied).map((c) => c.id)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const all = ticked.size === criteria.length;

  return (
    <div className="approve">
      <div className="approve-head">
        Approve — confirm each one. You are the evidence for these.
      </div>

      {criteria.map((c) => (
        <label key={c.id} className={ticked.has(c.id) ? "approve-row approve-row-on" : "approve-row"}>
          <input
            type="checkbox" checked={ticked.has(c.id)} onChange={() => toggle(c.id)}
            className="approve-box"
          />
          <span>{c.statement}</span>
        </label>
      ))}

      <div className="approve-actions">
        <button
          className="btn btn-primary" disabled={pending || ticked.size === 0}
          onClick={() => startTransition(async () => {
            setError(null);
            const r = await approveAction(engagement, role, taskId, [...ticked]);
            if (!r.ok) setError(r.error ?? "Could not approve.");
            else router.refresh();
          })}
        >
          {pending ? "Recording…" : all ? "Approve and close" : `Confirm ${ticked.size} of ${criteria.length}`}
        </button>
        {!all && (
          <span className="text-muted approve-note">
            {criteria.length - ticked.size} unconfirmed — the task stays open until every one is.
          </span>
        )}
        {error && <span className="start-error">{error}</span>}
      </div>
    </div>
  );
}
