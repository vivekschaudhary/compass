"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Run the agent.
 *
 * Hits the route rather than a server action because a real run takes minutes, and shows that
 * plainly instead of a spinner that implies something quicker.
 */
export function RunButton({ engagement, role, taskId, hasOpenQuestions, secondary = false }: {
  engagement: string; role: string; taskId: string; hasOpenQuestions: boolean;
  /** Once a draft exists, running again REPLACES it — that is not the primary act at the gate. */
  secondary?: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  async function run() {
    setRunning(true); setOutcome(null);
    try {
      const res = await fetch("/api/v2/agent/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagement, role, taskId }),
      });
      const d = await res.json();
      setOutcome(
        d.kind === "asked" ? `Asked ${d.questions?.length ?? 0} question(s).`
        : d.kind === "drafted" ? `Drafted ${d.sections} section(s) into ${d.path}.`
        : d.kind === "refused" ? `The model declined: ${d.reason}`
        : d.error ?? d.message ?? "Something went wrong.",
      );
      router.refresh();
    } catch (e) {
      setOutcome(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="run-row">
      <button
        className={secondary ? "btn btn-secondary" : "btn btn-primary"}
        onClick={run} disabled={running || hasOpenQuestions}
      >
        {running
          ? "Working — this takes a few minutes…"
          : secondary ? "Run again — replaces the draft" : "Run the agent"}
      </button>
      {hasOpenQuestions && (
        <span className="text-muted run-note">Answer the open questions first.</span>
      )}
      {outcome && <span className="run-outcome">{outcome}</span>}
    </div>
  );
}
