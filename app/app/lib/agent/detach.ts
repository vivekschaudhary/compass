// Start real work without making the caller wait for it to finish.
//
// A run takes minutes. Until now, `/api/agent/run` held that whole HTTP request open the entire
// time — fine for today's `npm run dev` (a long-lived process; the request dying does not stop the
// work, since nothing here is tied to the socket), but it means the response the browser gets back
// IS the run's own outcome, which is what made `Composer` treat "the fetch resolved" as "the run
// finished." `detach` lets the caller respond immediately — "accepted" — while the real work
// continues underneath, exactly as `withHeartbeat`/the sweep already assume something can be
// running that no open request is waiting on.
//
// NOT wired to `@vercel/functions`' `waitUntil` yet — that package is not a dependency of this app,
// and adding one is a deployment-prep decision, not a side effect of this change. On today's target
// (a persistent local process) plain fire-and-forget is correct: the process outlives the request
// regardless. The moment this ever runs on Vercel, `waitUntil` becomes necessary — the platform can
// freeze a function shortly after it responds — and this is the one place that would change: swap
// the body for `waitUntil(fn())` (imported from `@vercel/functions`), keep the same signature, and
// no caller of `detach` needs to know.
export function detach(fn: () => Promise<unknown>): void {
  void fn().catch((e) => {
    // A caller that awaited this would see the rejection; nobody does, so this is the last chance
    // to not lose it silently (rule 11). `runAgent` itself already catches its own failures and
    // writes them to the task's turn/event trail — reaching HERE means something escaped even that,
    // which is itself worth a loud console entry rather than a swallowed promise rejection.
    console.error("detach: unhandled rejection in detached work", e);
  });
}
