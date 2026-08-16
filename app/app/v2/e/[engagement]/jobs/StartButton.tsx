"use client";

// The click that starts a job. Nothing starts itself, so this is the only thing that moves a task
// out of idle — and it says what happened rather than quietly re-rendering.

import { useState, useTransition } from "react";
import { Button } from "../../../_ui/primitives";
import { startTaskAction } from "./actions";

export function StartButton({
  taskId, engagement, role, state,
}: {
  taskId: string; engagement: string; role: string; state: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (state !== "idle") {
    return <span className="task-state text-muted">{labelFor(state)}</span>;
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
      {/* A refusal is worth showing. The routine raises rather than no-opping precisely so a
          second click does not look like a first one that worked. */}
      {error && <span className="start-error">{error}</span>}
    </div>
  );
}

function labelFor(state: string): string {
  switch (state) {
    case "running": return "agent working…";
    case "awaiting": return "waiting on you";
    case "hitl": return "awaiting approval";
    case "closed": return "done";
    default: return state;
  }
}
