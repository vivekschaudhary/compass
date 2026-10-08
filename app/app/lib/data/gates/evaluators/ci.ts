import { supabaseAdmin } from "../../../supabase";
import type { Actor } from "../../actor";
import type { CriterionRow, Verdict } from "../types";
import { latestRanHandoffCall, type HandoffCallRow } from "../../handoff-call";

/**
 * `ci is green` for a scaffold row. The generator runs the project's checks in its own checkout and
 * records the result on the handoff record; this reads that record. It never calls GitHub, so no
 * token is needed here, and the verdict is only as current as the last generator run.
 */
export async function evaluateCiChecks(
  _actor: Actor,
  _c: CriterionRow,
  taskId: string | null,
): Promise<Verdict> {
  const sb = supabaseAdmin();
  if (!sb || !taskId) return { state: "unmeasurable", why: "no task to read a handoff from" };
  const call = await latestRanHandoffCall(sb, taskId);
  return verdictOfHandoff(call);
}

/** Pure mapping from the newest handoff record to a verdict. Exported so it can be tested without a database. */
export function verdictOfHandoff(call: HandoffCallRow | null): Verdict {
  if (!call) return { state: "unmeasurable", why: "the generator has not run for this task" };
  switch (call.status) {
    case "running":
      return { state: "unmeasurable", why: "the generator is still running" };
    case "shipped": {
      const ran = call.result?.checks.ran.length ?? 0;
      return { state: "satisfied", source: "compass", detail: `checks passed (${ran}) and a pull request is open: ${call.pr_url}` };
    }
    case "checks_failed":
      return { state: "unsatisfied", source: "compass", detail: `check failed: ${call.result?.checks.failed ?? "unknown"}` };
    case "generator_failed":
    case "refused":
      return { state: "unsatisfied", source: "compass", detail: call.result?.refusal ?? `the generator ${call.status}` };
  }
}
