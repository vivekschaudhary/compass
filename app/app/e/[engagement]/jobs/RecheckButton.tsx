"use client";

// Re-measure this row's gate, now.
//
// A page render shows what was last measured and when — it deliberately writes nothing, so a
// refresh never looks like fresh evidence. This is the other half of that bargain: the one control
// that DOES go and look again. Closing the row a gate waits on re-measures it automatically, so
// this is the escape hatch for everything else — a document published out of band, a connector that
// came back, a Jira status somebody moved by hand.
//
// It lived twice inside StartButton and nowhere on the task page, which is the page you are on when
// you are staring at a verdict you do not believe.

import { useState, useTransition } from "react";
import { recheckAction } from "./actions";

export function RecheckButton({
  engagement, role, taskId,
}: {
  engagement: string; role: string; taskId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        className="btn btn-ghost recheck"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await recheckAction(engagement, role, taskId);
            if (!r.ok) setError(r.error ?? "Could not re-check it.");
          })
        }
      >
        {pending ? "re-checking…" : "re-check"}
      </button>
      {/* A check that could not run is not a check that passed. */}
      {error && <span className="start-error">{error}</span>}
    </>
  );
}
