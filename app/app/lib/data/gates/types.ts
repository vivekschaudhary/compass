// Shapes shared by every evaluator and by the lifecycle code that calls them. Unchanged from
// gates.ts — this file only gives them a home the evaluators can import without pulling in
// measurement, approval or the registry itself.

export type CriterionRow = {
  id: string;
  kind: "ready" | "done";
  /** The task slug of the step this criterion belongs to; null means the workflow as a whole. */
  stepTask: string | null;
  statement: string;
  subjectKind: string | null;
  subjectRef: string | null;
  operator: string | null;
  value: string | null;
};

export type Verdict =
  | { state: "satisfied"; source: string; detail: string }
  | { state: "unsatisfied"; source: string; detail: string }
  /** Not a failure. Nothing has happened yet that could decide it. */
  | { state: "unmeasurable"; why: string };

export type CriterionStatus = CriterionRow & { verdict: Verdict };

export type StoredStatus = CriterionRow & {
  satisfied: boolean | null; // null = never checked
  measuredAt: string | null;
  source: string | null;
  detail: string | null;
};

export type NestedClose = { closed: true } | { closed: false; why: string };
