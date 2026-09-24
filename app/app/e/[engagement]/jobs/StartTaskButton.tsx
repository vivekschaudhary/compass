"use client";

// The control for an ordinary row — one an agent actually works. Nothing starts itself, so this is
// the only thing that moves such a row out of idle, and it says what happened rather than quietly
// re-rendering.
//
// Starting the task and running the agent are two different acts: this only flips the row to
// `running`, via `startTaskAction`, and sends the person to the task page — the model call itself
// happens there, when they press "Run the agent".

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../_ui/primitives";
import { startTaskAction } from "./actions";
import { RecheckButton } from "./RecheckButton";
import { labelFor } from "./state-label";

export function StartTaskButton({
  taskId,
  engagement,
  role,
  state,
  executor,
  href,
  openQuestions = 0,
  readyMet = false,
}: {
  taskId: string;
  engagement: string;
  role: string;
  state: string;
  /** Which engine has the task. NULL means nothing has picked it up. */
  executor?: string | null;
  /** Where the job lives. A card that says "waiting on you" must give you somewhere to go. */
  href?: string;
  openQuestions?: number;
  /** Every Ready criterion measured and satisfied — see `readyAllMet` on the page. */
  readyMet?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (state !== "idle") {
    if (
      href &&
      (state === "awaiting" || state === "hitl" || state === "running")
    ) {
      return (
        <div className="task-state-row">
          <a href={href} className="btn btn-primary">
            {openQuestions > 0
              ? `Answer ${openQuestions} question${openQuestions === 1 ? "" : "s"}`
              : state === "hitl"
                ? "Review the draft"
                : "Open the job"}
          </a>
          <span className="task-state text-muted">
            {labelFor(state, executor)}
          </span>
        </div>
      );
    }
    return (
      <span className="task-state text-muted">{labelFor(state, executor)}</span>
    );
  }

  return (
    <div className="start-control">
      <Button
        variant="primary"
        compact
        disabled={!readyMet}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await startTaskAction(engagement, role, taskId);
            if (!r.ok) {
              setError(r.error ?? "Could not start it.");
              return;
            }
            if (href) router.push(href);
          })
        }
      >
        {pending ? "Starting…" : "Start with agent"}
      </Button>
      <RecheckButton engagement={engagement} role={role} taskId={taskId} />

      {error && <span className="start-error">{error}</span>}
    </div>
  );
}
