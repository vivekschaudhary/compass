// Split out of `RealtimeRefresh.tsx` so importing this one pure function doesn't drag in that
// component's whole dependency tree — which now reaches `OptimisticTurns.tsx` → `actions.ts` →
// `lib/data/job.ts` → `"server-only"`, fatal to import outside Next's own runtime. Same reason
// `heartbeat-config.ts` is its own file rather than living inside `run.ts`.

const MAX_BACKOFF_MS = 30_000;

/** 1s, 2s, 4s, 8s… capped — pulled out so the cap itself is checked by a real test, not just read
 *  by eye. The one easy way to get this wrong is forgetting the cap and reconnecting slower and
 *  slower forever on a real outage. */
export function backoffMs(retries: number): number {
  return Math.min(MAX_BACKOFF_MS, 1000 * 2 ** retries);
}
