"use client";

// One composer, where `AnswerForm` + `NoteBox` + `RunButton` used to be three separate blocks
// stacked on the page. Same calls underneath — `answerAction`, `uploadAnswer`, `noteAction`, and
// `RunButton` itself, untouched — this is a render-only regrouping into the Claude-style shape:
// one open question at a time, a persistent input below it, a "+" for whichever question currently
// wants a document.
//
// Auto-advance falls out for free rather than being tracked here: answering a question calls
// `router.refresh()`, the server re-fetches `questions` without the one just answered, and the view
// resets to its first entry — which is now the next question, not the same one re-shown.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OpenQuestion } from "@/app/lib/data/job";
import { answerAction, noteAction, resumeForReviewAction, resetStalledRunAction } from "./actions";
import { startTaskAction } from "../actions";
import { requestRun } from "./run-agent";
import { uploadAnswer } from "./upload-answer";
import { RunButton } from "./RunButton";
import { formatElapsed } from "@/app/lib/agent/heartbeat-config";
import { useOptimisticTurns } from "./OptimisticTurns";

/** What the file picker offers. Everything `readUpload` can actually read, and nothing else. */
const ACCEPT = ".pdf,.docx,.xlsx,.xlsm,.csv,.tsv,.md,.markdown,.txt";

export function Composer({
  engagement,
  role,
  holderId,
  taskId,
  questions,
  closed,
  hasOpenQuestions,
  secondary,
  reviewOnly,
  hitl,
  autoRun,
  idle,
  readyMet,
  running,
  stalled,
  heartbeatAt,
}: {
  engagement: string;
  role: string;
  /** Which of `role`'s several holders (if more than one) is acting — see `resolveActor`. */
  holderId?: string | null;
  taskId: string;
  questions: OpenQuestion[];
  closed: boolean;
  /** Passed straight through to `RunButton` for its own copy ("Answer N questions" etc.). */
  hasOpenQuestions: boolean;
  secondary?: boolean;
  /** Passed straight through to `RunButton` — see its own doc for why this needs its own copy. */
  reviewOnly?: boolean;
  /**
   * `runAgent` refuses anything but `state: "running"`, and a plain note never moves a row there
   * on its own (see `addNote`'s own doc comment) — only a formal Reject does, today. So a message
   * sent while `hitl` calls `resumeForReviewAction` first, making the same transition `reject()`
   * makes, without a criterion attached. A comment is not a verdict — it is still filed as an
   * ordinary note, this only unblocks the run that follows it.
   */
  hitl?: boolean;
  autoRun?: boolean;
  /**
   * The row has not been started yet — `RunButton` calls `runAgent` directly with no state check
   * of its own, and `runAgent` does not verify it is actually running before claiming the executor
   * slot. Landing here via a child run's own link, still idle, and pressing "Run the agent" is
   * exactly how a task got stuck: claimed, never started, never released, invisible to the sweep
   * (which only watches `running` rows). So `idle` gets its own control — "Start with agent" via
   * `startTaskAction`, the one thing that actually moves a row out of `idle` — rather than letting
   * `RunButton` render at all.
   */
  idle?: boolean;
  readyMet?: boolean;
  /**
   * The DB's own answer to "is this claimed and alive right now", regardless of whether THIS tab
   * is the one that started it — a reload, a different tab, or coming back later all need to say
   * the same thing rather than offering "Run the agent" over a task that is already running
   * somewhere else. See `heartbeat-config.ts` for the staleness line `stalled` sits the other side
   * of.
   */
  running?: boolean;
  /** A claim past the staleness threshold with nobody left to release it — see `resetStalledRun`. */
  stalled?: boolean;
  heartbeatAt?: string | null;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [pending, startTransition] = useTransition();
  const [resetting, setResetting] = useState(false);
  const { addPending, removePending } = useOptimisticTurns();

  // Ticks once a second only while something is actually shown that needs it — the thinking bubble
  // or the stuck badge — rather than running an interval on every job page regardless.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!working && !running && !stalled) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [working, running, stalled]);

  // `requestRun` now answers "accepted" in milliseconds — the run itself is detached and takes
  // minutes — so `working` can no longer mean "this tab is awaiting a fetch". It stays on from the
  // moment a run is accepted until the DB says it landed: `running` (heartbeat-driven, from the
  // server) goes true when the claim is made, and false again when the run finishes. Without this
  // the thinking bubble would vanish the instant the request returned, minutes before anything
  // was actually done.
  const sawRunning = useRef(false);
  useEffect(() => {
    if (!working) { sawRunning.current = false; return; }
    if (running) { sawRunning.current = true; return; }
    if (sawRunning.current) setWorking(false);
  }, [working, running]);
  // Never wait forever on a claim that never came (refused, or finished before a refresh saw it).
  useEffect(() => {
    if (!working) return;
    const t = setTimeout(() => setWorking(false), 45_000);
    return () => clearTimeout(t);
  }, [working]);

  // Never past the end — the list shrinks after every answer, and a stale index otherwise points at
  // nothing.
  const at = Math.min(index, Math.max(0, questions.length - 1));
  const current = questions[at] ?? null;

  const [starting, setStarting] = useState(false);
  async function start() {
    setError(null);
    setStarting(true);
    const r = await startTaskAction(engagement, role, taskId, holderId);
    setStarting(false);
    if (!r.ok) { setError(r.error ?? "Could not start it."); return; }
    // Re-render from the server: `state` flips to `running`, and the page's own `autoRun` becomes
    // true on this fresh read — `RunButton`'s effect fires from that, not from anything tracked
    // here. Same handoff `StartTaskButton` already makes via navigation; there is nowhere to
    // navigate TO here, since this is already that task's own page.
    router.refresh();
  }

  async function runIfLastAnswer(remaining: number | undefined) {
    if (remaining !== 0) return;
    setWorking(true);
    const run = await requestRun(engagement, role, taskId, holderId);
    if (!run.ok) { setWorking(false); setError(run.message); }
    // The run's own reply lands after the run, not before — a second refresh once it settles is
    // what brings that turn in and clears the "thinking" bubble.
    router.refresh();
  }

  function submitAnswer(value: string) {
    if (!current) return;
    // Echoed and cleared BEFORE the request, not after — the round trip a real write takes must
    // not be the thing that decides when your own answer becomes visible. `removePending` on
    // failure, since a failed write has nothing coming to reconcile it away otherwise.
    setText("");
    const pendingId = value.trim() ? addPending(value, null) : null;
    startTransition(async () => {
      setError(null);
      const r = await answerAction(engagement, role, taskId, { [current.id]: value }, holderId);
      if (!r.ok) {
        setError(r.error ?? "Could not record that.");
        if (pendingId) removePending(pendingId);
        return;
      }
      setIndex(0); // the answered question is gone after refresh; land on whatever is now first
      // Posted before the run starts, not after it finishes — an answer that only appears once a
      // model call minutes away has completed reads as the click having done nothing.
      router.refresh();
      await runIfLastAnswer(r.remaining);
    });
  }

  function submitNote() {
    if (!text.trim()) return;
    const body = text;
    setText("");
    const pendingId = addPending(body, null);
    startTransition(async () => {
      setError(null);
      const r = await noteAction(engagement, role, taskId, body, holderId);
      if (!r.ok) {
        setError(r.error ?? "Could not add that.");
        removePending(pendingId);
        return;
      }
      // Refreshed HERE, before the agent runs, so the message you just sent shows up in the chat
      // immediately — same reasoning as `submitAnswer`. A message TO the agent is one side of a
      // conversation, not a note filed and left for someone to notice, so it answers back without
      // a second click on "Run the agent" — but only once the row is actually running: `closed`
      // has nothing left to run, and `idle` has never been started (the row's own "Start with
      // agent" control does that, not this).
      router.refresh();
      if (!closed && !idle) {
        // `hitl` needs an explicit nudge FIRST — `runAgent` refuses anything but `state:
        // "running"`, and this row is paused for approval. Skipped everywhere else, where the row
        // is already running and this would be a silent no-op.
        if (hitl) {
          const resumed = await resumeForReviewAction(engagement, role, taskId, holderId);
          if (!resumed.ok) { setError(resumed.error ?? "Could not resume it."); return; }
        }
        setWorking(true);
        const run = await requestRun(engagement, role, taskId, holderId);
        if (!run.ok) { setWorking(false); setError(run.message); }
        router.refresh();
      }
    });
  }

  async function submitUpload(file: File) {
    if (!current) return;
    setError(null);
    setNote(null);
    setUploading(true);
    const r = await uploadAnswer(engagement, role, taskId, current.id, file);
    setUploading(false);
    if (!r.ok) { setError(r.message); return; }
    setNote(r.message);
    setIndex(0);
    await runIfLastAnswer(r.remaining);
    router.refresh();
  }

  const busy = pending || uploading || working;

  async function resetStalled() {
    setError(null);
    setResetting(true);
    const r = await resetStalledRunAction(engagement, role, taskId, holderId);
    setResetting(false);
    if (!r.ok) { setError(r.error ?? "Could not reset it."); return; }
    router.refresh();
  }

  return (
    <div className="composer">
      {/* The agent's own turn hasn't landed yet — this sits where it will, styled as its bubble,
          so the wait reads as "it's replying" rather than the page having done nothing. The
          message you just sent is already in `Conversation` above by the time this shows, since
          `submitNote`/`submitAnswer` refresh before awaiting the run, not after.
          `running` (not just `working`) so this also shows on a page that loaded mid-run from a
          DIFFERENT tab or a later visit — the exact case that used to render nothing at all, or a
          "Run the agent" button over a task already running somewhere else. */}
      {(working || running) && !stalled && (
        <div className="msg msg-thinking" aria-live="polite">
          <span className="msg-thinking-dot" />
          <span className="msg-thinking-dot" />
          <span className="msg-thinking-dot" />
          <span className="msg-thinking-elapsed">
            working{heartbeatAt ? ` — ${formatElapsed(heartbeatAt, now)}` : "…"}
          </span>
        </div>
      )}

      {stalled && (
        <div className="jobs-note jobs-note-stalled">
          <span>
            Stuck{heartbeatAt ? ` since ${formatElapsed(heartbeatAt, now)}` : ""} — the process behind
            this run is gone, not just slow.
          </span>
          <button
            className="btn btn-secondary btn-compact"
            disabled={resetting}
            onClick={resetStalled}
          >
            {resetting ? "Resetting…" : "Reset this run"}
          </button>
        </div>
      )}

      {current && (
        <div className="qcard">
          {/* The counter and prev/next nav earn their place only once there is more than one
              question queued — a single question is just the agent's own last word, and a "1 of
              1" counter with disabled arrows around it is what made this read as a form. */}
          {questions.length > 1 && (
            <div className="qcard-head">
              <span className="qcard-count">{at + 1} of {questions.length}</span>
              <div className="qcard-nav">
                <button
                  className="qcard-nav-btn" disabled={at === 0}
                  onClick={() => setIndex(at - 1)} aria-label="Previous question"
                >‹</button>
                <button
                  className="qcard-nav-btn" disabled={at >= questions.length - 1}
                  onClick={() => setIndex(at + 1)} aria-label="Next question"
                >›</button>
              </div>
            </div>
          )}

          <p className="qcard-prompt">{current.prompt.split("\n")[0]}</p>
          {current.prompt.split("\n").slice(1).join("\n").trim() && (
            <p className="qcard-why">{current.prompt.split("\n").slice(1).join("\n").trim()}</p>
          )}

          {current.type === "choice" && current.options?.length ? (
            <div className="qcard-options">
              {current.options.map((o, i) => (
                <button
                  key={o} className="qcard-option" disabled={busy}
                  onClick={() => submitAnswer(o)}
                >
                  <span className="qcard-option-num">{i + 1}</span>
                  {o}
                </button>
              ))}
            </div>
          ) : null}

          {current.filesTo && (
            <label className="qcard-upload">
              <input
                type="file" className="sr-only" accept={ACCEPT} disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) submitUpload(file);
                }}
              />
              <span className="btn btn-secondary btn-compact">
                {uploading ? "Reading the file…" : "Upload a file"}
              </span>
              <span className="text-muted qcard-upload-note">
                or paste the text below, or give a link — filed verbatim at <code>{current.filesTo}</code>
              </span>
            </label>
          )}

          {current.optional && (
            <button
              className="qcard-skip" disabled={busy}
              onClick={() => submitAnswer("")}
            >
              Skip — nothing to supply
            </button>
          )}
        </div>
      )}

      <div className="composer-dock">
        <div className="composer-input-row">
          <textarea
            className="input composer-input"
            rows={1}
            value={text}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              current
                ? "Answer, or paste a link or the text itself…"
                : closed
                  ? "Add a note to the record…"
                  : "Say something to the agent…"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (current) submitAnswer(text);
                else submitNote();
              }
            }}
          />
          <button
            className="btn btn-primary composer-send"
            disabled={busy || !text.trim()}
            onClick={() => (current ? submitAnswer(text) : submitNote())}
          >
            {busy ? "…" : "Send"}
          </button>
        </div>

        {/* Starting or running is a distinct act from answering — offered beside the composer, not
            instead of it, exactly as RunButton and NoteBox already coexisted before this merge. A
            closed task offers neither: a note goes on the record, nothing here restarts it.
            Suppressed on `running`/`stalled` too — those already render their own control above
            (the thinking bubble, or the stuck badge's own Reset button); offering "Run the agent"
            here as well is the exact ambiguity this was built to remove. */}
        {!current && !closed && !running && !stalled && (
          idle ? (
            <div className="start-control">
              <button
                className="btn btn-primary btn-compact"
                disabled={starting || !readyMet}
                onClick={start}
              >
                {starting ? "Starting…" : "Start with agent"}
              </button>
            </div>
          ) : (
            <RunButton
              engagement={engagement} role={role} holderId={holderId} taskId={taskId}
              hasOpenQuestions={hasOpenQuestions} secondary={secondary} reviewOnly={reviewOnly}
              autoRun={autoRun}
            />
          )
        )}

        {error && <span className="start-error">{error}</span>}
        {note && !error && <span className="ask-upload-done">{note}</span>}
      </div>
    </div>
  );
}
