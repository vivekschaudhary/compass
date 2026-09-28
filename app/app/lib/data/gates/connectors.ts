import type { Actor } from "../actor";
import { evaluate } from "./registry";
import type { CriterionRow, Verdict } from "./types";

/**
 * Check the engagement's connectors right now, without a task.
 *
 * The same evaluators the gate uses, callable on their own — for a setup screen, and for answering
 * "can Compass actually reach Confluence" without having to find a task whose gate happens to ask.
 */
export async function checkConnectors(
  actor: Actor,
): Promise<{ connector: string; verdict: Verdict }[]> {
  const shape = (ref: string): CriterionRow => ({
    id: "",
    kind: "ready",
    stepTask: null,
    statement: "",
    subjectKind: "connector",
    subjectRef: ref,
    operator: "is",
    value: "wired",
  });
  return Promise.all(
    ["docs", "tickets"].map(async (connector) => ({
      connector,
      verdict: await evaluate(actor, shape(connector)),
    })),
  );
}
