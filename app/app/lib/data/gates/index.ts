// Evaluating gates — turning criteria into measurements.
//
// THREE STATES, NOT TWO. A criterion is satisfied, not satisfied, or NOT YET MEASURABLE, and the
// third is not a polite way of saying false. "The reviewer approved" before anyone has reviewed is
// unknown; treating it as false makes a queue look blocked, and treating it as true is the false
// green everything here is built against. Unknown is the absence of a measurement row.
//
// The split matters: this directory knows HOW to evaluate — it can read documents, check
// connectors, and later ask Jira and GitHub. The DATABASE enforces that it was done, by refusing to
// start a task whose Ready criteria have no satisfied measurement. Neither half can be skipped.
//
// One file per concern, not one 1,586-line file: `registry.ts` dispatches to `evaluators/*` (a
// `Map`, so a new subject kind is a new entry and a new file rather than an edit to a shared
// `switch` everyone's evaluator touched); `measure.ts` is the lifecycle that writes and re-measures;
// `storage.ts` is the read-only display path; `approve.ts` is a person acting as the evaluator.
// `../gates.ts` re-exports this module so every existing import path keeps working unchanged.

import "server-only";

export type {
  CriterionRow,
  Verdict,
  CriterionStatus,
  StoredStatus,
  NestedClose,
} from "./types";

export { evaluate } from "./registry";

export {
  criteriaForTask,
  measureTask,
  remeasureRun,
  closeNestingRowIfSatisfied,
  parentRunOf,
  tally,
} from "./measure";

export { storedStatusFor } from "./storage";

export { approve, reject } from "./approve";

export { checkConnectors } from "./connectors";

export { describeCriterion } from "@/app/_ui/criterion";
