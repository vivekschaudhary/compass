// Every recognized fan-out kind, keyed by the token its nested workflow's `produces`/`outputs`
// path uses (`{epic}`, `{repo}`) — and the one fact two otherwise-unrelated places both need to
// agree on: whether a row carrying this kind opens a child `workflow_run` per subject ("nest"), or
// materializes the nested workflow's steps as plain sibling tasks inside the SAME run ("inline").
//
// TWO READERS, ONE ANSWER.
//   - `data/phases/nested.ts` (runtime) uses this to decide how `openNestedFanOut` actually fans
//     out — `nest` opens `openNestedPerSubject`'s child runs, `inline` materializes in place
//     (Jira caps nesting at one level below an epic, so a repo's steps can't be a second-level
//     child run under `foundation-architecture`).
//   - `import/plan.ts` (import time) uses it to decide which Done criterion shape a nesting row
//     gets. Before this file existed, `plan.ts` had no notion of `mode` at all and always emitted
//     the `nest` shape (`subject_kind: "nested"` — "every child run this row opened has closed").
//     `scaffold-repos` (repo, inline) got that criterion anyway, and `evaluateNested` can only ever
//     see `nest`-mode child runs — it found none, forever, and the row could never close. One
//     stuck run (`client1-osbl`'s foundation-architecture) was the first symptom; see issue for the
//     fix that split the Done criterion in two (`evaluators/nested.ts` vs `evaluators/inline-fanout.ts`).
//
// `resolvePath` (`adapters.ts`) must recognize the same token names as the keys here — kept in
// sync by hand, same as `MAX_RUN_ATTEMPTS` between `run.ts` and the SQL sweep.
export const FAN_OUT_MODE: Record<string, "nest" | "inline"> = {
  epic: "nest",
  repo: "inline",
};

/** Which fan-out kind (if any) a set of produced paths declares, by its `{kind}` token. */
export function fanOutKindOf(outputs: (string | null | undefined)[]): string | null {
  for (const kind of Object.keys(FAN_OUT_MODE)) {
    if (outputs.some((o) => o?.includes(`{${kind}}`))) return kind;
  }
  return null;
}
