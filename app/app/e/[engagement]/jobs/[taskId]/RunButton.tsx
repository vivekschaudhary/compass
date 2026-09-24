"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { requestRun } from "./run-agent";

/**
 * Run the agent.
 *
 * Hits the route rather than a server action because a real run takes minutes, and shows that
 * plainly instead of a spinner that implies something quicker.
 */
export function RunButton({
  engagement,
  role,
  taskId,
  hasOpenQuestions,
  secondary = false,
  autoRun = false,
}: {
  engagement: string;
  role: string;
  taskId: string;
  hasOpenQuestions: boolean;
  /** Once a draft exists, running again REPLACES it — that is not the primary act at the gate. */
  secondary?: boolean;
  /**
   * Fire the run once, on arrival, instead of waiting for a click.
   *
   * The page decides this, not the button — it is true exactly when the row was JUST started (on
   * the Jobs queue) and nothing has run on it yet. "When — and only when you click it" still holds:
   * this fires because of the click that started the row, not instead of one.
   */
  autoRun?: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  // Guards against firing twice — React's dev-mode double-invoke of effects, or a re-render before
  // the router has caught up with the state this effect read to decide to fire at all.
  const firedRef = useRef(false);

  async function run() {
    setRunning(true);
    setOutcome(null);
    const r = await requestRun(engagement, role, taskId);
    setOutcome(r.message);
    router.refresh();
    setRunning(false);
  }

  useEffect(() => {
    if (!autoRun || firedRef.current) return;
    firedRef.current = true;
    run();
    // Fires once, off the `autoRun` this page load computed — never re-armed by a later prop
    // change, which is what "once, on arrival" means.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="run-row">
      <button
        className={secondary ? "btn btn-secondary" : "btn btn-primary"}
        onClick={run}
        disabled={running || hasOpenQuestions}
      >
        {running
          ? "Working — this takes a few minutes…"
          : secondary
            ? "Run again — replaces the draft"
            : "Run the agent"}
      </button>
      {hasOpenQuestions && (
        <span className="text-muted run-note">
          Answer the open questions first.
        </span>
      )}
      {outcome && <span className="run-outcome">{outcome}</span>}
    </div>
  );
}
