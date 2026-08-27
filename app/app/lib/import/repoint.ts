// Can an open run be moved from the version it started on to the published one?
//
// A run pins its version, and that is correct: a gate someone approved must not silently become a
// different gate. So publishing does not move runs, and a fix to a workflow does not reach a board
// already executing the old one. Pre-MVP, when runs are disposable, moving them is acceptable —
// but only when the move is provably total.
//
// Pure on purpose. The decision — does every step have a counterpart? — is the only part worth
// testing, and it has no business touching a database to be exercised. `scripts/repoint-runs.mts`
// does the reading and the writing around it.

/** Enough of a step to decide the move. */
export type RepointStep = { id: string; ord: number; task: string };

export type RepointPlan =
  | {
      ok: true;
      /** Old step id → new step id, for every step in the source version. */
      moves: Map<string, string>;
      /** Steps whose position changed, for the report. Not a problem — the point of slugs. */
      renumbered: { task: string; from: number; to: number }[];
    }
  | {
      ok: false;
      /** Task slugs present in the source version and absent from the target. */
      orphans: string[];
    };

/**
 * Match by SLUG, never by ordinal.
 *
 * An ordinal is a position, and matching on it is precisely the defect being repaired: when
 * sprint-0 absorbed pre-sprint-0 the steps were renumbered, and anything bound to a position
 * silently followed the position rather than the row.
 *
 * Refuses whole rather than moving what it can. A partial move leaves some tasks on the old
 * version's steps and some on the new one — a run that reads as coherent and is not, which is
 * worse than a run that is visibly still on the old version.
 */
export function planRepoint(from: RepointStep[], to: RepointStep[]): RepointPlan {
  const target = new Map(to.map((s) => [s.task, s]));

  const orphans = from.filter((s) => !target.has(s.task)).map((s) => s.task);
  if (orphans.length) return { ok: false, orphans };

  const moves = new Map<string, string>();
  const renumbered: { task: string; from: number; to: number }[] = [];
  for (const s of from) {
    const t = target.get(s.task)!;
    moves.set(s.id, t.id);
    if (t.ord !== s.ord) renumbered.push({ task: s.task, from: s.ord, to: t.ord });
  }

  return { ok: true, moves, renumbered };
}
