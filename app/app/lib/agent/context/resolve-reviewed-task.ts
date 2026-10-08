// Split out of `loaders.ts` so this one pure function is importable for its own test without
// dragging in `loaders.ts`'s whole dependency tree (templates, jira, sprint, adapters, actor —
// several of which reach `"server-only"`, fatal outside Next's own runtime). Same reason
// `heartbeat-config.ts` and `realtime-backoff.ts` are their own files.

/**
 * Walk `depends_on` back from `startTask` until a step with a real `produces` turns up — a plain
 * one-hop lookup is correct for an ordinary review, but not for a review-of-a-review chain, where
 * the immediately-depended-on step is itself a `doc-review`/`code-review` row with no `produces` of
 * its own. `lookup` is injected so the chain-walk is testable without a live Supabase client; the
 * call site (`loaders.ts`) wires it to `workflow_step`. Capped at `maxHops` so a misconfigured or
 * cyclic `depends_on` graph halts (returns null, same as "not found") rather than looping.
 */
export async function resolveReviewedTask(
  startTask: string | null,
  lookup: (task: string) => Promise<{ produces: string | null; dependsOn: string[] | null } | null>,
  maxHops = 5,
): Promise<string | null> {
  let taskName = startTask;
  for (let hops = 0; hops < maxHops && taskName; hops++) {
    const row = await lookup(taskName);
    if (!row) return null;
    if (row.produces) return row.produces;
    taskName = row.dependsOn?.[0] ?? null;
  }
  return null;
}
