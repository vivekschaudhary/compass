// Split out of `RealtimeRefresh.tsx` for the same reason `realtime-backoff.ts` is: a pure helper a
// test can import without that component's dependency tree.
//
// supabase-js hands back the EXISTING channel when `client.channel(topic)` is called for a topic that
// is still registered, and `removeChannel` is async — it waits for the server to acknowledge the
// unsubscribe before the channel leaves the client's list. So a cleanup that calls `removeChannel`
// and a re-run that calls `channel(topic)` straight away gets the old, already-subscribed channel
// back, and `.on("postgres_changes", …)` on it throws "cannot add `postgres_changes` callbacks …
// after `subscribe()`". React runs an effect twice on mount in development, and the reconnect path
// does the same thing by hand, so it happened every time.
//
// The topic itself cannot change per mount: the server broadcasts `run-ended` on `task-<id>`
// (`notify-run-ended.ts`). So the fix is order, not naming — whoever opens a topic waits for the
// previous channel on it to finish releasing.

type Releasable<C> = { removeChannel(channel: C): Promise<unknown> };

const releasing = new Map<string, Promise<void>>();

/** Remove `channel` and remember that `topic` is mid-release until the client confirms. Never
 *  rejects: a failed unsubscribe must not stop the next subscribe, and the caller has nobody to
 *  hand the error to — it is in a cleanup function or a timer. */
export function releaseChannel<C>(client: Releasable<C>, topic: string, channel: C): Promise<void> {
  const done: Promise<void> = Promise.resolve()
    .then(() => client.removeChannel(channel))
    .then(
      () => undefined,
      () => undefined,
    )
    .then(() => {
      if (releasing.get(topic) === done) releasing.delete(topic);
    });
  releasing.set(topic, done);
  return done;
}

/** Resolves once nothing on `topic` is still being released — immediately when nothing is. */
export function whenReleased(topic: string): Promise<void> {
  return releasing.get(topic) ?? Promise.resolve();
}
