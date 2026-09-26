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
