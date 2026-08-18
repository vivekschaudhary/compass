"use client";

// The click that starts a job. Nothing starts itself, so this is the only thing that moves a task
// out of idle — and it says what happened rather than quietly re-rendering.

import { useState, useTransition } from "react";
import { Button } from "../../../_ui/primitives";
import { startTaskAction, recheckAction } from "./actions";

export function StartButton({
  taskId, engagement, role, state, executor, href, openQuestions = 0,
}: {
  taskId: string; engagement: string; role: string; state: string;
  /** Which engine has the task. NULL means nothing has picked it up. */
  executor?: string | null;
  /** Where the job lives. A card that says "waiting on you" must give you somewhere to go. */
  href?: string;
  openQuestions?: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (state !== "idle") {
    // A state alone is a dead end. When there is something for a person to do, the card carries
    // the way to do it — the label told you the task was waiting and then offered nothing to press.
    if (href && (state === "awaiting" || state === "hitl" || state === "running")) {
      return (
        <div className="task-state-row">
          <a href={href} className="btn btn-primary">
            {openQuestions > 0
              ? `Answer ${openQuestions} question${openQuestions === 1 ? "" : "s"}`
              : state === "hitl" ? "Review the draft" : "Open the job"}
          </a>
          <span className="task-state text-muted">{labelFor(state, executor)}</span>
        </div>
      );
    }
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
