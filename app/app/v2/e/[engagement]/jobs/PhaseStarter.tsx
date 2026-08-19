"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { initiatePhaseAction } from "./actions";

/**
 * Starting a phase.
 *
 * Intake provisions and stops, so a new engagement's queue is empty until someone decides the work
 * begins — that decision is this button. The refusal is the interesting part: a phase whose entry
 * gate is unmet says which criterion, in full, rather than greying out and leaving the reader to
 * guess. "Not ready" with no reason is the thing this product exists to replace.
 */
export function PhaseStarter({ engagement, role, phases }: {
  engagement: string; role: string;
  phases: { code: string; label: string; state: "open" | "closed" | "available" }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const startable = phases.filter((p) => p.state === "available");
  if (!startable.length) return null;

  return (
    <div className="phases">
      <h3 className="phases-head">Start a phase</h3>
      <p className="text-muted phases-blurb">
        Creating the engagement provisioned it. Nothing runs until you say so.
      </p>

      <div className="phases-row">
        {startable.map((p) => (
          <button
            key={p.code} className="btn btn-primary" disabled={pending}
            onClick={() => startTransition(async () => {
              setError(null); setBusy(p.code);
              const r = await initiatePhaseAction(engagement, role, p.code);
              setBusy(null);
              if (!r.ok) setError(r.error ?? `Could not start ${p.label}.`);
              else router.refresh();
            })}
          >
            {busy === p.code ? `Starting ${p.label}…` : `Initiate ${p.label}`}
          </button>
        ))}
      </div>

      {/* Whitespace preserved: the refusal is a list of criteria, one per line. */}
      {error && <pre className="phases-error">{error}</pre>}
    </div>
  );
}
