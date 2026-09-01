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

/** Enough of a step to decide the move, and to carry the new definition onto the task. */
export type RepointStep = { id: string; ord: number; task: string; title?: string | null };

/** Where a task lands, and what it should say once it is there. */
export type RepointTarget = { id: string; title: string | null };

export type RepointPlan =
  | {
      ok: true;
      /** Old step id → where the task goes, for every step in the source version. */
      moves: Map<string, RepointTarget>;
      /** Steps whose position changed, for the report. Not a problem — the point of slugs. */
      renumbered: { task: string; from: number; to: number }[];
      /**
       * Steps whose TITLE changed, for the report.
       *
       * `work_task.title` is a snapshot taken when the task was created, so a run that moves to a
       * new version keeps whatever the old one said. That made a move look applied and change
       * nothing anyone could see: the sprint-planning row was retitled "Sprint plan for sprint 1",
       * the repoint reported the run moved, and the board went on reading "Sprint plan for
       * sprints 1-3" — the fix was in the version the run now pointed at, and invisible on it.
       */
      retitled: { task: string; from: string | null; to: string | null }[];
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

  const moves = new Map<string, RepointTarget>();
  const renumbered: { task: string; from: number; to: number }[] = [];
  const retitled: { task: string; from: string | null; to: string | null }[] = [];
  for (const s of from) {
    const t = target.get(s.task)!;
    moves.set(s.id, { id: t.id, title: t.title ?? null });
    if (t.ord !== s.ord) renumbered.push({ task: s.task, from: s.ord, to: t.ord });
    // Compared on the SOURCE version's title rather than on the task's, because this is pure and
    // has no task to read. The writer applies it unconditionally; this is only the report.
    if ((t.title ?? null) !== (s.title ?? null)) {
      retitled.push({ task: s.task, from: s.title ?? null, to: t.title ?? null });
    }
  }

  return { ok: true, moves, renumbered, retitled };
}
