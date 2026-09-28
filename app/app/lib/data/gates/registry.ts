import type { Actor } from "../actor";
import type { CriterionRow, Verdict } from "./types";
import { evaluateDocument } from "./evaluators/document";
import { evaluateConnector } from "./evaluators/connector";
import { evaluateTicket } from "./evaluators/ticket";
import { evaluateBacklog } from "./evaluators/backlog";
import { evaluateNested } from "./evaluators/nested";
import { evaluateCiChecks } from "./evaluators/ci";

type Evaluator = (
  actor: Actor,
  c: CriterionRow,
  taskId: string | null,
) => Promise<Verdict>;

/**
 * One entry per `subject_kind` a criterion can name. Adding a kind is adding a line here and a
 * file under `evaluators/`, not editing a shared `switch` that every kind's change used to touch —
 * that shared edit was the merge-conflict magnet the split exists to remove.
 */
const registry = new Map<string, Evaluator>([
  ["document", evaluateDocument],
  ["connector", (actor, c) => evaluateConnector(actor, c)],
  ["ticket", evaluateTicket],
  ["backlog", evaluateBacklog],
  ["nested", (_actor, c, taskId) => evaluateNested(c, taskId)],
  ["ci", evaluateCiChecks],
]);

/**
 * Evaluate one criterion.
 *
 * Anything without an evaluator is UNMEASURABLE, and says which subject it needed. That list is
 * itself useful: it is exactly what has to be wired next for a gate to stop being decorative.
 */
export async function evaluate(
  actor: Actor,
  c: CriterionRow,
  taskId: string | null = null,
): Promise<Verdict> {
  if (!c.subjectKind) {
    return {
      state: "unmeasurable",
      why: "judgment — a person decides this one",
    };
  }
  if (c.subjectKind === "roster") {
    return { state: "unmeasurable", why: "no roster evaluator yet" };
  }
  const evaluator = registry.get(c.subjectKind);
  if (!evaluator) {
    return {
      state: "unmeasurable",
      why: `no evaluator for '${c.subjectKind}'`,
    };
  }
  return evaluator(actor, c, taskId);
}
