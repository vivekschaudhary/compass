// Ordering work by its step.
//
// A phase creates every task in ONE transaction, so their `created_at` values are identical to the
// millisecond and ordering by them is arbitrary — on the first real run it put step 2 before step 1,
// which numbered the epic's stories backwards and would show a queue in the wrong dependency order.
//
// PostgREST cannot fix it either: ordering on a referenced table sorts the EMBEDDED rows, not the
// parent rows. So the step's ord travels with the row and the sort happens here.

type WithStep = { workflow_step?: { ord: number } | { ord: number }[] | null };

/** The step's ord, tolerating PostgREST returning a to-one relation as an array. */
export function ordOf(row: WithStep): number {
  const s = row.workflow_step;
  if (!s) return Number.MAX_SAFE_INTEGER;   // no step: last, never interleaved
  return Array.isArray(s) ? (s[0]?.ord ?? Number.MAX_SAFE_INTEGER) : s.ord;
}

export function sortByStep<T extends WithStep>(rows: T[]): T[] {
  return [...rows].sort((a, b) => ordOf(a) - ordOf(b));
}
