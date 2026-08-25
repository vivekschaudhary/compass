"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { initiatePhaseAction } from "./actions";

/**
 * What the run is doing, read from the event log while it does it.
 *
 * NOT a timer cycling reassurances. Initiating a phase takes the better part of a minute — thirteen
 * rows, each probing Confluence and Jira, then fourteen issues on the board — and a button that
 * greys out and says nothing for that long is indistinguishable from a hang. The first instinct is
 * to click again.
 *
 * So the messages are the real ones: "Confluence space Test1 answered", "Filed TEST1-1 and 13
 * stories on the board". When the log has nothing to say this shows the elapsed time and no
 * sentence, because inventing progress in the one place someone is actually watching is the status
 * theater this product exists to replace.
 */
function useProgress(engagement: string, role: string, active: boolean) {
  const [line, setLine] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const since = useRef<string>("");

  // The reset lives in the click handler rather than here: clearing state in the effect body
  // triggers a cascading render, and the moment a run STARTS is the honest place to forget the
  // previous one's last line anyway.
  const reset = () => { setLine(null); setSeconds(0); };

  useEffect(() => {
    if (!active) return;

    // A moment before the click, so the run's own first event is inside the window. Client and
    // server clocks differ, and a second of slack costs nothing while a missed first line is the
    // one that would have said the work started.
    since.current = new Date(Date.now() - 2000).toISOString();
    const started = Date.now();
    let alive = true;

    const tick = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);

    const poll = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/v2/progress?engagement=${encodeURIComponent(engagement)}` +
          `&role=${encodeURIComponent(role)}&since=${encodeURIComponent(since.current)}`,
          { cache: "no-store" },
        );
        if (!res.ok || !alive) return;
        const { lines } = (await res.json()) as { lines: { at: string; line: string }[] };
        if (!lines?.length || !alive) return;
        // The newest one is what someone wants to see; the rest have already scrolled past in the
        // only sense that matters here.
        const last = lines[lines.length - 1];
        setLine(last.line);
        // Advance the window so the next poll returns only what is new. Without this the feed
        // re-reads the whole run every 1.2s and grows with it.
        since.current = last.at;
      } catch {
        // A failed poll is not a failed run. Say nothing and try again.
      }
    }, 1200);

    return () => { alive = false; clearInterval(poll); clearInterval(tick); };
  }, [active, engagement, role]);

  return { line, seconds, reset };
}

/**
 * Starting a phase.
 *
 * Intake provisions and stops, so a new engagement's queue is empty until someone decides the work
 * begins — that decision is this button. The refusal is the interesting part: a phase whose entry
 * gate is unmet says which criterion, in full, rather than greying out and leaving the reader to
 * guess. "Not ready" with no reason is the thing this product exists to replace.
 */
export function PhaseStarter({
  engagement,
  role,
  phases,
}: {
  engagement: string;
  role: string;
  phases: {
    code: string;
    label: string;
    state: "open" | "closed" | "available";
  }[];
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  // Keyed BY PHASE, and only rendered while that phase is still startable. A single `error` string
  // outlived the thing it described: basecamp was refused, then succeeded, and its refusal sat
  // above a queue full of basecamp's tasks flatly contradicting it. A message about a phase that
  // is no longer offered cannot be true.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Hooks run before the early return below, which is why this is here and not inside the map.
  const { line, seconds, reset } = useProgress(engagement, role, busy !== null);

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
            className="btn btn-primary"
            disabled={busy !== null || refreshing}
            onClick={async () => {
              // OUTSIDE any transition, deliberately. React 19 holds every state update made
              // inside an async transition until the action settles and then applies them in one
              // commit — so `setBusy(code)` followed sixty seconds later by `setBusy(null)`
              // cancelled out and the spinner never rendered once. `isPending` was the only thing
              // that moved, and it only greys the button out. Verified in a browser: a value set
              // inside the scope is never observable while the action runs, one set before it is.
              // `startTransition` is kept below for `router.refresh()`, which is what it is for.
              setErrors((e) => ({ ...e, [p.code]: "" }));
              reset();
              setBusy(p.code);
              try {
                const r = await initiatePhaseAction(engagement, role, p.code);
                if (!r.ok)
                  setErrors((e) => ({
                    ...e,
                    [p.code]: r.error ?? `Could not start ${p.label}.`,
                  }));
                else startTransition(() => router.refresh());
              } catch {
                setErrors((e) => ({
                  ...e,
                  [p.code]: `Could not start ${p.label}. The request did not complete.`,
                }));
              } finally {
                // In `finally` so a thrown action stops the spinner too — a loader left turning
                // over a dead request is the hang it was added to rule out.
                setBusy(null);
              }
            }}
          >
            {busy === p.code ? (
              <>
                <span className="spinner" aria-hidden="true" />
                {`Starting ${p.label}…`}
              </>
            ) : (
              `Initiate ${p.label}`
            )}
          </button>

          {/* The live feed, beside the button that caused it.
              `aria-live` because the whole point is that it changes while someone waits, and a
              screen reader that never announced it would leave them with the silent button this
              exists to fix. */}
          {busy === p.code && (
            <p className="phases-progress" aria-live="polite">
              <span className="phases-progress-line">
                {/* No sentence when the log has none. The elapsed count is still true. */}
                {line ?? "Working…"}
              </span>
              <span className="phases-progress-elapsed">{seconds}s</span>
            </p>
          )}

          {/* Whitespace preserved: the refusal is a list of criteria, one per line. */}
          {errors[p.code] && (
            <pre className="phases-error">{errors[p.code]}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
