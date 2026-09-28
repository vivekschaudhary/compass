// The one number "is this run still alive?" is decided from, shared by every reader of it.
//
// Lives on its own rather than inside `run.ts` (which owns the writer's half — see `withHeartbeat`)
// so `lib/data/job.ts` can read it without an import cycle: `run.ts` already imports from
// `data/job.ts` for `conversation`/`openQuestions`.
//
// The SQL migration (`run_heartbeat.sql`) cannot import this — it duplicates the number with a
// comment pointing back here, the same way `MAX_RUN_ATTEMPTS` is already duplicated across the SQL
// and TS sides. Change both together.
export const HEARTBEAT_STALE_MINUTES = 10;

/**
 * A claimed row whose heartbeat has gone stale — the one check every reader of `heartbeat_at` needs
 * (the job page's own banner, the queue's row label, `resetStalledRun`'s safety condition), kept in
 * one place so "stale" means the same threshold everywhere rather than three inline copies of the
 * same arithmetic drifting apart.
 *
 * No `server-only` import here on purpose — this is pure and used from the client (`Composer`'s
 * ticking display) as well as server components and `lib/data`.
 */
export function isStale(heartbeatAt: string | null, nowMs: number = Date.now()): boolean {
  return heartbeatAt !== null && nowMs - new Date(heartbeatAt).getTime() > HEARTBEAT_STALE_MINUTES * 60_000;
}

/**
 * The last moment there is any evidence a claim was alive: its heartbeat, or — for a claim that
 * somehow never got one (an out-of-band write, a future code path that sets `executor` without
 * `heartbeat_at`) — when the row was started. `isStale(null)` is false by design ("no evidence" is
 * not "dead"), which on its own made such a claim read as alive for ever; falling back to
 * `started_at` gives it the same grace period as any other and then lets it be seen as stuck.
 * Every non-idle row has a `started_at` (the table's own check constraint), so this is null only
 * for a row that was never claimed at all.
 */
export function lastSign(heartbeatAt: string | null, startedAt: string | null): string | null {
  return heartbeatAt ?? startedAt;
}

/** "1m 12s" / "43s" — never fractional seconds, nobody needs that precision. */
export function formatElapsed(since: string, nowMs: number = Date.now()): string {
  const s = Math.max(0, Math.floor((nowMs - new Date(since).getTime()) / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
