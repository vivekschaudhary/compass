"use client";

// The click that starts a job. Nothing starts itself, so this is the only thing that moves a task
// out of idle — and it says what happened rather than quietly re-rendering.

import { useState, useTransition } from "react";
import { Button } from "../../../_ui/primitives";
import { startTaskAction, recheckAction } from "./actions";

export function StartButton({
  taskId, engagement, role, state, executor,
}: {
  taskId: string; engagement: string; role: string; state: string;
  /** Which engine has the task. NULL means nothing has picked it up. */
  executor?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (state !== "idle") {
    return <span className="task-state text-muted">{labelFor(state, executor)}</span>;
  }

  return (
    <div className="start-control">
      <Button
        variant="primary"
        compact
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await startTaskAction(engagement, role, taskId);
            if (!r.ok) setError(r.error ?? "Could not start it.");
          })
        }
      >
        {pending ? "Starting…" : "Start with agent"}
      </Button>
      <button
        className="btn btn-ghost recheck"
        disabled={pending}
        onClick={() => startTransition(async () => { setError(null); await recheckAction(engagement, role, taskId); })}
      >
        re-check
      </button>
      {/* A refusal is worth showing in full. The routine raises rather than no-opping precisely so
          a second click does not look like a first one that worked — and the message names which
          criterion, and whether it failed or was never checked. */}
      {error && <span className="start-error">{error}</span>}
    </div>
  );
}

/**
 * What the card says is happening.
 *
 * `running` means someone clicked start. It does NOT mean an agent is working — an agent has the
 * task only once an executor has picked it up. Saying "agent working…" with no executor attached
 * is the exact false green this model exists to prevent, and it was here until someone read the
 * screen carefully. Until the agent loop lands, every started task honestly says so.
 */
function labelFor(state: string, executor?: string | null): string {
  switch (state) {
    case "running": return executor ? "agent working…" : "started · no agent attached yet";
    case "awaiting": return "waiting on you";
    case "hitl": return "awaiting approval";
    case "closed": return "done";
    default: return state;
  }
}
