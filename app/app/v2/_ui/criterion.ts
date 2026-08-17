// Pure display helpers for criteria.
//
// Separate from lib/data/gates.ts because that module is `server-only` — it holds the evaluators
// and the writes. A client component that needs to LABEL a criterion was dragging the whole
// server module into the browser bundle, which Next correctly refused. Reading and evaluating
// are different jobs and now live in different files.

export type CriterionShape = {
  statement: string;
  subjectKind: string | null;
  subjectRef: string | null;
  operator: string | null;
  value: string | null;
};

/** How a criterion reads when it has no statement of its own. */
export function describeCriterion(c: CriterionShape): string {
  if (c.statement) return c.statement;
  if (c.subjectKind) return `${c.subjectKind} ${c.subjectRef} ${c.operator} ${c.value}`;
  return "unnamed criterion";
}
