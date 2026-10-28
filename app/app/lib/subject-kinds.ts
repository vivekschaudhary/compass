// The things a workflow can be started ABOUT, and the one place that says how each is recognised,
// named and found. A workflow is about one epic (`refine-stories`: its produced paths name `{epic}`)
// or one story (`build`: they name `{subject}`); a start screen shows a picker for the kind, the
// start flow refuses a ref that is not one, and a run's rows hang under the ticket that kind owns.
//
// Adding a kind is a row here plus a finder in `data/subject-choices.ts` — the picker, the start
// flow and the Jobs table all read this, which is the point of it being one table.
//
// Not the same registry as `FAN_OUT_KINDS`. That one says how a NESTING row fans out (one child run
// per epic, or inline per repo); this one is about a run a person starts directly. `epic` is in both
// because both are true of it.

import { fanOutKindOf } from "./fan-out-kinds";

export type SubjectKind = "epic" | "story";

export type SubjectKindInfo = {
  /** The word the person reads: "Choose a story…". */
  noun: string;
  /** The `{token}` in a produced path that this kind fills. */
  token: string;
  /** The `backlog_item.kind` rows of this kind carry. */
  backlogKind: "epic" | "story";
};

export const SUBJECT_KINDS: Record<SubjectKind, SubjectKindInfo> = {
  epic: { noun: "epic", token: "epic", backlogKind: "epic" },
  story: { noun: "story", token: "subject", backlogKind: "story" },
};

/** Which kind (if any) a workflow is about, from what its published steps produce. */
export function subjectKindOfOutputs(outputs: (string | null | undefined)[]): SubjectKind | null {
  // `{epic}` is read through the fan-out registry so the two cannot disagree about what an epic path is.
  if (fanOutKindOf(outputs) === "epic") return "epic";
  if (outputs.some((o) => o?.includes(`{${SUBJECT_KINDS.story.token}}`))) return "story";
  return null;
}

/** What a picker offers: one thing the workflow can be started for. */
export type SubjectChoice = {
  /** The backlog handle (`ACC-E1-S3`) — what is stored as the run's `subject_ref`. */
  ref: string;
  title: string;
  /** The tracker's key (`CT-361`). A subject with none is not offered: nothing to hang the work on. */
  ticketKey: string;
  /** What to show after the title — "3 stories" for an epic, the epic's key for a story. */
  detail: string | null;
};

/** One line for a picker option. Same shape for every kind. */
export function describeChoice(c: SubjectChoice): string {
  return `${c.ticketKey} · ${c.title}${c.detail ? ` (${c.detail})` : ""}`;
}
