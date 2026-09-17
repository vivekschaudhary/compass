"use client";

/**
 * A read that failed, said as a failure.
 *
 * The counterpart to `must` in lib/supabase.ts. Before it, a dropped connection reaching
 * `buildContext` returned null and the page called `notFound()` — someone looking at their own
 * running task was told it does not exist. Now the read throws and lands here, which is worse
 * looking and far more truthful: the task is fine, the load is not, and retrying is worth a try.
 *
 * A 404 still means a 404 — a bad id, or a task belonging to another engagement.
 */
export default function JobError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="job-error">
      <h1>This job could not be loaded.</h1>
      <p className="text-muted">
        The task is still there — reading it failed. Trying again often works.
      </p>
      {/* The message in development, where it is the actual cause — "read task: invalid input
          syntax for type uuid". In PRODUCTION Next redacts it and substitutes a notice saying so,
          keeping only the digest, so the digest is the real handle: it appears here and beside the
          full message in the server log, and it is what makes the two the same incident. Verified
          on a production build rather than assumed. */}
      <pre className="job-error-detail">{error.message}</pre>
      {error.digest && (
        <p className="text-muted">
          Reference <code>{error.digest}</code> — the full message is in the server log under it.
        </p>
      )}
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
