// The named transitions every outcome ends on: closing the run's own log entry, keeping the claim
// alive while the model call is in flight, releasing it (with the retry/backoff bookkeeping that
// belongs to every completion and failure path alike), handing a row to a person, and the one way a
// SUPPLIED row can close itself. Moved out of `run.ts` as-is — no ordering or behaviour change.

import { supabaseAdmin } from "../../supabase";
import { emit } from "../../data/events";
import { mirrorState } from "../../data/tracker";
import { approve, measureTask } from "../../data/gates";
import type { Actor } from "../../data/actor";
import type { AgentContext } from "../context";
import type { HostResult } from "../hosts/types";
import { recordTurn } from "./turn-context";

/**
 * Close the run in the log, whatever way it ended.
 *
 * Cost and stop reason belong on the record: "why did this task take four minutes and produce
 * nothing" is a question the log should answer without anyone re-running it.
 */
export async function finished(
  engagementId: string,
  taskId: string,
  roleCode: string,
  outcome: string,
  message: HostResult | null,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await emit({
    engagementId,
    subjectType: "task",
    subjectId: taskId,
    verb: "agent.run.finished",
    actorKind: "agent",
    actorRoleCode: roleCode,
    payload: {
      outcome,
      stopReason: message?.stopReason ?? null,
      // Null when the host has no metered usage to report, which is a real answer rather than a
      // gap — a subscription-backed run genuinely costs no tokens, and writing 0 here would make
      // it indistinguishable from a metered run that somehow used none.
      inputTokens: message?.usage?.inputTokens ?? null,
      outputTokens: message?.usage?.outputTokens ?? null,
      ...extra,
    },
  });
}

/** How often the model call touches `heartbeat_at` while it is in flight. See `withHeartbeat`. */
const HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * Keep `work_task.heartbeat_at` fresh for as long as `fn` is still running.
 *
 * The claim (`executor` set) already says SOMEONE is working this row; it says nothing about
 * whether that someone is still alive. A process killed mid-`host.dispatch` — a dev-server restart,
 * a deploy, a crash — leaves `executor` set forever with nothing left to clear it, which is the
 * exact shape of the stuck-run incident this app's operator hit twice, both times fixed by hand
 * with a raw Postgres PATCH. The sweep (`run_heartbeat.sql`) treats a stale heartbeat as an
 * abandoned claim; this is the other half, keeping it un-stale for as long as the call is genuinely
 * still going.
 *
 * The timer is cleared in `finally`, not just after a successful resolve — a rejection must stop
 * touching the row too, or the interval outlives the call it was timing and keeps a dead task
 * looking alive until the process itself exits.
 */
export async function withHeartbeat<T>(taskId: string, fn: () => Promise<T>): Promise<T> {
  const sb = supabaseAdmin();
  // Supabase's query builder is a lazy thenable — building the chain does nothing until it is
  // awaited. `setInterval`'s callback cannot be `async` in a way anyone awaits its result, so this
  // wraps the await in its own fire-and-forget async function rather than leaving the request
  // unbuilt-but-never-sent, which is silent in exactly the way rule 11 warns against: no error,
  // no effect, and nothing about it looks wrong from the call site.
  const touch = () => {
    void (async () => {
      try {
        await sb
          ?.from("work_task")
          .update({ heartbeat_at: new Date().toISOString() })
          .eq("id", taskId)
          // A row the sweep already released (or one that finished) must not be marked alive again
          // by a timer tick that fires after the fact — only touch a claim this call still holds.
          .eq("executor", "app");
      } catch {
        // Best-effort. A missed tick just means the NEXT one (20s later) still lands before the
        // sweep's 10-minute staleness window could possibly close.
      }
    })();
  };
  const timer = setInterval(touch, HEARTBEAT_INTERVAL_MS);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
  }
}

/** How long the sweep waits before retrying a failed attempt, indexed by attempt number. Capped. */
const BACKOFF_MINUTES = [1, 2, 5, 15, 30];
/** Past this many failed attempts, stop retrying and surface it rather than retry forever. */
const MAX_RUN_ATTEMPTS = 5;

/**
 * Release the `executor` claim — the one place every completion and failure path does it, so the
 * retry bookkeeping lives once instead of at each of the ~14 sites that used to just clear it.
 *
 * `failed` is the whole decision. A row that reached `hitl`/`awaiting`/`closed` made progress — not
 * a retry, so `run_attempts`/`next_attempt_at` reset to nothing owed. A row still sitting at
 * `running` when this is called did NOT make progress, and that is exactly the signal the
 * reconciliation sweep reads: `state = 'running' and executor is null`. Counting a failure there is
 * what lets the sweep back off a persistently-failing row instead of re-hammering it every tick.
 *
 * Past `MAX_RUN_ATTEMPTS`, stop incrementing the backoff and say so loudly (`task.run_exhausted`)
 * rather than let a hopeless row retry forever with no one ever finding out — the swallowed-failure
 * rule 11 names, applied to the retry loop itself.
 */
export async function releaseExecutor(
  taskId: string,
  ctx: AgentContext,
  opts: { failed: boolean; state?: string },
): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;

  if (!opts.failed) {
    await sb
      .from("work_task")
      .update({
        executor: null,
        run_attempts: 0,
        next_attempt_at: null,
        ...(opts.state ? { state: opts.state } : {}),
      })
      .eq("id", taskId);
    return;
  }

  const { data: row } = await sb
    .from("work_task")
    .select("run_attempts")
    .eq("id", taskId)
    .maybeSingle();
  const attempts = (row?.run_attempts ?? 0) + 1;

  if (attempts > MAX_RUN_ATTEMPTS) {
    await sb
      .from("work_task")
      .update({ executor: null, run_attempts: attempts, next_attempt_at: null })
      .eq("id", taskId);
    await emit({
      engagementId: ctx.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.run_exhausted",
      actorKind: "system",
      actorRoleCode: ctx.roleCode,
      payload: { attempts },
    });
    return;
  }

  const minutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
  await sb
    .from("work_task")
    .update({
      executor: null,
      run_attempts: attempts,
      next_attempt_at: new Date(Date.now() + minutes * 60_000).toISOString(),
    })
    .eq("id", taskId);
}

/**
 * Hand the row to a person.
 *
 * Every terminal path that leaves work for a human does the same four things, and the reason this
 * function exists is that one of them forgot: the supplied-row skip returned its outcome without
 * setting `hitl` or clearing `executor`, so `file-sow` filed its document correctly and then sat at
 * "agent working…" for ever, with no ApprovePanel — that renders only on `hitl`.
 *
 * Copying four lines a fourth time is how that happens again. Called from one place, it cannot.
 *
 * `mirrorState` is included because the board is where everyone who does not open Compass is
 * looking; a queue that says "awaiting approval" over a ticket still marked in-progress is two
 * answers to one question.
 */
export async function handOver(
  actor: Actor,
  taskId: string,
  ctx: AgentContext,
  outcome: string,
  message: HostResult | null,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await releaseExecutor(taskId, ctx, { failed: false, state: "hitl" });
  await mirrorState(actor.engagementId, taskId, "hitl", ctx.roleCode);
  await finished(ctx.engagementId, taskId, ctx.roleCode, outcome, message, extra);
}

/**
 * A SUPPLIED row closes itself. Nobody approves their own paste.
 *
 * The HITL gate exists so a person checks what a MODEL produced. On a supplied row the person IS
 * the author — they pasted the document — and asking them to then approve it is ceremony that
 * records nothing. Worse, the gate is usually entirely machine-checked ("sow is published"), so
 * `ApprovePanel` has nothing for them to sign and its confirm button greys out with no way forward.
 *
 * `approve(actor, taskId, [])` rather than a second closing path. Passing no confirmations means:
 * leave every machine-established measurement exactly as the check wrote it, and clear anything a
 * person would have had to attest. Then the BOARD closes first and `close_task` enforces the real
 * gate. So this does not bypass anything — if such a row ever carries a judgment criterion, the
 * close is refused and the row correctly goes to a human instead.
 *
 * Re-measured first, because the document was filed moments ago and the gate reads stored
 * measurements, not the world.
 */
export async function settleSupplied(
  actor: Actor,
  taskId: string,
  ctx: AgentContext,
  outcome: string,
  message: HostResult | null,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await measureTask(actor, taskId);
  const closed = await approve(actor, taskId, []);

  if (closed.ok) {
    await releaseExecutor(taskId, ctx, { failed: false });
    await finished(ctx.engagementId, taskId, ctx.roleCode, outcome, message, {
      ...extra,
      closed: true,
    });
    return;
  }

  // The gate said no, or the board would not take it. Never leave the row mid-flight: hand it to a
  // person with the reason, which is the case the plain hand-over exists for.
  await recordTurn(
    taskId,
    `The document is filed, but this row could not close itself: ${closed.error}`,
    ctx,
  );
  await handOver(actor, taskId, ctx, outcome, message, { ...extra, closed: false });
}
