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
  // Keyed BY PHASE, and only rendered while that phase is still startable. A single `error` string
  // outlived the thing it described: basecamp was refused, then succeeded, and its refusal sat
  // above a queue full of basecamp's tasks flatly contradicting it. A message about a phase that
  // is no longer offered cannot be true.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const startable = phases.filter((p) => p.state === "available");
  if (!startable.length) return null;

  return (
    <div className="phases">
      <h3 className="phases-head">Start a phase</h3>
      <p className="text-muted phases-blurb">
        Creating the engagement provisioned it. Nothing runs until you say so.
      </p>

      {startable.map((p) => (
        <div key={p.code} className="phases-one">
          <button
            className="btn btn-primary" disabled={pending}
            onClick={() => startTransition(async () => {
              setErrors((e) => ({ ...e, [p.code]: "" }));
              setBusy(p.code);
              const r = await initiatePhaseAction(engagement, role, p.code);
              setBusy(null);
              if (!r.ok) setErrors((e) => ({ ...e, [p.code]: r.error ?? `Could not start ${p.label}.` }));
              else router.refresh();
            })}
          >
            {busy === p.code ? `Starting ${p.label}…` : `Initiate ${p.label}`}
          </button>

          {/* Whitespace preserved: the refusal is a list of criteria, one per line. */}
          {errors[p.code] && <pre className="phases-error">{errors[p.code]}</pre>}
        </div>
      ))}
    </div>
  );
}
