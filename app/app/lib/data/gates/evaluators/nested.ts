import { supabaseAdmin, must } from "../../../supabase";
import type { CriterionRow, Verdict } from "../types";

/**
 * Every child run this row opened has closed.
 *
 * The check a per-document criterion cannot make. `openNestedFanOut` opens one child run per epic
 * against ONE parent task, and `close_parent_task_when_child_run_closes` fires as each of them
 * closes — so a row with no gate closed on the FIRST epic and left the others running behind a row
 * the plan already counted as done. With this criterion `close_task` refuses until the last one is
 * in, and the trigger's exception path leaves the parent honestly open in the meantime.
 *
 * UNMEASURABLE when no child run exists, never satisfied. "All of nothing has closed" is true and
 * useless — it is the aggregate-over-zero-rows trap, and it would let the row close before anyone
 * pressed Start.
 */
export async function evaluateNested(
  c: CriterionRow,
  taskId: string | null,
): Promise<Verdict> {
  if (!taskId)
    return {
      state: "unmeasurable",
      why: "not a row of a run, so nothing nests under it",
    };
  const sb = supabaseAdmin();
  if (!sb) return { state: "unmeasurable", why: "no database" };

  const runs = must(
    "read nested runs",
    await sb.from("workflow_run").select("state").eq("parent_task_id", taskId),
  );
  if (!runs?.length) {
    return {
      state: "unmeasurable",
      why: `no ${c.subjectRef ?? "nested"} run has been opened yet`,
    };
  }

  const open = runs.filter((r) => r.state !== "closed").length;
  const what = c.subjectRef ?? "nested";
  return open === 0
    ? {
        state: "satisfied",
        source: "compass",
        detail: `All ${runs.length} ${what} run(s) closed.`,
      }
    : {
        state: "unsatisfied",
        source: "compass",
        detail: `${open} of ${runs.length} ${what} run(s) still open.`,
      };
}
