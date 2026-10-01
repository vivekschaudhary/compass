import { supabaseAdmin } from "../../../supabase";
import { resolvePath } from "../../../adapters";
import { subjectOfRun } from "../../run-subject";
import type { Actor } from "../../actor";
import type { CriterionRow, Verdict } from "../types";

/** The subject of the run a task belongs to — what fills `{epic}` in that task's paths. */
async function subjectFor(
  taskId: string,
): Promise<{ ref: string | null; key: string | null } | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data: task } = await sb
    .from("work_task")
    .select("workflow_run_id, subject_ref")
    .eq("id", taskId)
    .maybeSingle();
  return subjectOfRun(
    (task?.workflow_run_id as string | null) ?? null,
    (task?.subject_ref as string | null) ?? null,
  );
}

export async function evaluateDocument(
  actor: Actor,
  c: CriterionRow,
  taskId: string | null,
): Promise<Verdict> {
  const sb = supabaseAdmin();
  if (!sb) return { state: "unmeasurable", why: "no database" };

  // A criterion may name its subject (`03-architecture/epic/{epic}`) — the same path the step
  // produces, and it has to resolve the same way here or the gate would measure a document nobody
  // filed while the real one sits published at the resolved path.
  //
  // UNMEASURABLE, NOT UNSATISFIED, when it cannot be filled. "No document at
  // 03-architecture/epic/{epic}" is not a fact about the work — it is this evaluator saying it did
  // not know where to look, and dressing that up as a failed check would blame the author for a
  // run that was opened wrong. Unmeasurable writes no measurement, so the close is still refused.
  let path = c.subjectRef;
  if (path?.includes("{")) {
    const subject = taskId ? await subjectFor(taskId) : null;
    path = resolvePath(c.subjectRef, subject);
    if (!path) {
      return {
        state: "unmeasurable",
        why: `${c.subjectRef} names a subject this run does not have`,
      };
    }
  }

  const { data: doc } = await sb
    .from("document")
    .select("id, current_version_id")
    .eq("engagement_id", actor.engagementId)
    .eq("path", path!)
    .maybeSingle();

  if (!doc) {
    // A document that does not exist is genuinely not satisfied — this is a real answer, not a
    // missing one. The path was declared and nothing is there.
    return {
      state: "unsatisfied",
      source: "compass",
      detail: `No document at ${path}.`,
    };
  }
  if (!doc.current_version_id) {
    return {
      state: "unsatisfied",
      source: "compass",
      detail: `${path} exists but has never been drafted.`,
    };
  }

  const { data: v } = await sb
    .from("document_version")
    .select("version, status")
    .eq("id", doc.current_version_id)
    .maybeSingle();

  const ok = v?.status === c.value;
  return ok
    ? {
        state: "satisfied",
        source: "compass",
        detail: `${path} is ${v!.status} at v${v!.version}.`,
      }
    : {
        state: "unsatisfied",
        source: "compass",
        detail: `${path} is ${v?.status ?? "unknown"}, not ${c.value}.`,
      };
}
