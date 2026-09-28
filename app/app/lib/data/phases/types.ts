import type { Mirrored } from "../tracker";
import type { Composed } from "../ticket-body";

/**
 * The board, in both halves: the tickets exist, and they say something.
 *
 * Two calls rather than one because they fail differently and must be reported apart. Mirroring is
 * structural — no epic means no board at all. Composition is editorial — a ticket whose body did not
 * compose is on the board and readable, just still carrying its placeholder. Collapsing them into
 * one "problems" list would make a model outage look like a Jira outage.
 */
export type BoardResult = Mirrored & { composed?: Composed };

export type Initiated =
  | {
      ok: true;
      runId: string;
      tasks: { id: string; title: string; role: string }[];
      mirrored?: BoardResult;
    }
  | { ok: false; error: string };

export type FanOutResult =
  | {
      ok: true;
      runs: {
        runId: string;
        subject: string | null;
        mirrored: BoardResult;
        /** Set when this run's first task was auto-started for the actor who opened it. */
        startedTaskId: string | null;
      }[];
    }
  | { ok: false; error: string };
