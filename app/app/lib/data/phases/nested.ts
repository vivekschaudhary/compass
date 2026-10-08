import { supabaseAdmin } from "../../supabase";
import type { Actor } from "../actor";
import { sortByStep } from "../steps";
import { remeasureRun } from "../gates";
import { mirrorNested, mirrorState } from "../tracker";
import { startTask } from "../tasks";
import { mirrorAndCompose } from "./lifecycle";
import type { BoardResult, FanOutResult } from "./types";

/**
 * Open the child run for a row that nests a workflow, and put it on the board.
 *
 * The row is done when that run closes — the trigger from 034 does that half. This is the other
 * half: someone starting the row.
 *
 * THE MIRROR RESULT IS RETURNED, NOT DROPPED. It used to return only `{ ok, runId }`, so a nested
 * run that could not reach Jira looked exactly like one that had — the same failure `initiatePhase`
 * already returns `mirrored` to avoid.
 *
 * THE PARENT STORY MOVES. Every other `mirrorState` call sits on the agent path or the close path,
 * and a nesting row runs no agent — so its story was created To Do and stayed there for the whole
 * nested run. A week of work under a card nobody saw move reads as a stalled row, not a busy one.
 */
export async function openNested(
  actor: Actor,
  taskId: string,
  subjectRef: string | null = null,
): Promise<
  | {
      ok: true;
      runId: string;
      mirrored: BoardResult;
      startedTaskId: string | null;
    }
  | { ok: false; error: string }
> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const { data: task } = await sb
    .from("work_task")
    .select("id, workflow_step_id")
    .eq("id", taskId)
    .eq("engagement_id", actor.engagementId)
    .maybeSingle();
  if (!task)
    return { ok: false, error: "That task is not in your engagement." };

  const { data: runId, error } = await sb.rpc("open_nested_run", {
    p_task_id: taskId,
    p_actor: actor.holder ?? actor.roleCode,
    p_actor_role: actor.roleCode,
    p_subject_ref: subjectRef,
  });
  if (error) return { ok: false, error: error.message };

  const mirrored = await mirrorAndCompose(
    actor.engagementId,
    runId as string,
    actor.roleCode,
    () => mirrorNested(actor.engagementId, runId as string, actor.roleCode),
    { taskLevel: "subtask" },
  );
  // The row itself is now in progress: its work is the child run. Reported through `mirrored`
  // rather than failing the open — the run exists whether or not the board heard about it.
  const moved = await mirrorState(
    actor.engagementId,
    taskId,
    "running",
    actor.roleCode,
  );
  if (
    !moved.ok &&
    moved.reason !== "no-tracker" &&
    moved.reason !== "no-ticket"
  ) {
    mirrored.problems.push(
      `The parent row's ticket did not move: ${moved.note}`,
    );
  }

  // Measure the child's rows, exactly as `initiatePhase` does for a phase's. Without it a nested
  // run opens with no measurements at all, and `start_task` refuses its first row as "Not ready"
  // even when the document it reads has been published for hours — the child-run half of the
  // staleness `remeasureRun` exists for.
  await remeasureRun(actor, runId as string);

  // Same role, continuing its own work, gets the same promise a plain task's click already makes:
  // the click IS the start. `start_task` carries no role check of its own — nothing in the
  // database stops starting a row owned by someone else — so this only fires when the child run's
  // first task belongs to the SAME role that just opened it. A different role's task is left
  // `idle` in ITS OWN queue, same as `initiatePhase` leaves every phase row idle for its owner —
  // starting someone else's task on their behalf, even though nothing would stop it, is not this
  // click's to do.
  //
  // Best-effort: the Ready gate can still refuse right after `remeasureRun`, and that must not
  // turn a successful open into a failure — the run DID open, only its first row could not start
  // yet. Left idle, exactly as if this block did not run at all.
  //
  // ORDERED BY STEP, NOT `created_at`. `open_workflow_run` now creates every step in one loop, so
  // their `created_at` values are identical to the millisecond — the exact "a phase writes every
  // row in one transaction" trap this repo already learned from (see `steps.ts`). Before this
  // child runs only ever had one row, so the bug was latent; it stops being latent the moment a
  // nested workflow has more than one step.
  const { data: runTasks } = await sb
    .from("work_task")
    .select("id, role_code, workflow_step(ord)")
    .eq("workflow_run_id", runId as string);
  const firstTask = sortByStep(runTasks ?? [])[0] ?? null;
  // Reported back so the CALLER can decide whether there is somewhere better to send the person
  // than the parent row's own page — see `startedTaskId` on `FanOutResult`. `openNested` itself
  // only starts it; routing there is a decision the click handler makes, not this function.
  let startedTaskId: string | null = null;
  if (firstTask?.role_code === actor.roleCode) {
    const started = await startTask(actor, firstTask.id as string).catch(
      () => null,
    );
    if (started?.ok) startedTaskId = firstTask.id as string;
  }

  return { ok: true, runId: runId as string, mirrored, startedTaskId };
}

/**
 * Open the single child run a nesting row gets by default.
 *
 * Most nesting rows are this shape: `sprint-0.draft-features` opens one `feature` run, and every
 * feature lands in one `features` document. `subject: null` because there is nothing to key the run
 * on — the row and its child are 1:1.
 */
async function openNestedSingle(
  actor: Actor,
  taskId: string,
): Promise<FanOutResult> {
  const one = await openNested(actor, taskId);
  return one.ok
    ? {
        ok: true,
        runs: [
          {
            runId: one.runId,
            subject: null,
            mirrored: one.mirrored,
            startedTaskId: one.startedTaskId,
          },
        ],
      }
    : one;
}

/**
 * Open the child run(s) for a nesting row — one, or one per subject.
 *
 */
export async function openNestedFanOut(
  actor: Actor,
  taskId: string,
): Promise<FanOutResult> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const kind = await nestedFanOutKind(taskId);
  if (!kind) return openNestedSingle(actor, taskId);

  const { subjectsOf, emptyError, mode } = FAN_OUT_KINDS[kind];
  const subjects = await subjectsOf(taskId);

  // `nest` — the kind wants its own run per subject (epics: a technical design is authored, read,
  // reviewed as its own thing). `inline` — the kind wants its steps materialized as plain tasks
  // inside the CALLING run instead (repos: Jira's own hierarchy caps at Epic -> Sub-task, and
  // `scaffold-repos` already sits one level nested under `sprint-0`'s `foundation-architecture`, so
  // a second nested run per repo cannot be mirrored — `mirrorNested` correctly refuses it as "nested
  // two deep"). One registry, one place each kind's whole behaviour is declared — see the comment
  // on `FAN_OUT_KINDS` below for why `mode` lives there and not on its own column.
  return mode === "inline"
    ? materializeInlinePerSubject(actor, taskId, subjects, emptyError)
    : openNestedPerSubject(actor, taskId, subjects, emptyError);
}

/** One subject this taskId's nested workflow can fan out over. */
type FanOutSubject = { ref: string };

/**
 * Every recognized fan-out kind, keyed by the token its nested workflow's `produces` path uses
 * (`{epic}`, `{repo}`). `resolvePath` (`adapters.ts`) must recognize the same token name, or a
 * subject this opens a run WITH still can't be filled INTO the path — the two lists are kept in
 * sync by hand, same as `MAX_RUN_ATTEMPTS` between `run.ts` and the SQL sweep.
 *
 * `mode` is declared HERE, per kind, rather than as a column a workflow authors separately.
 * `subjectsOf` already decides how a kind's subjects are discovered; `mode` is the same
 * classification, not a second one — splitting it into its own field (tried, then reverted while
 * designing this) would mean the SAME question ("what kind of fan-out is this") answered in two
 * places that could disagree, which is the exact `subject_ref`/`subject_key`/`ticket_key` trap this
 * whole fix exists to get out of.
 */
const FAN_OUT_KINDS: Record<
  string,
  {
    subjectsOf: (taskId: string) => Promise<FanOutSubject[]>;
    emptyError: string;
    mode: "nest" | "inline";
  }
> = {
  epic: {
    subjectsOf: epicsOfRun,
    emptyError:
      "This row opens one technical design per epic, and this run has no epics. " +
      "Nothing was opened — draft and approve the epics first.",
    mode: "nest",
  },
  repo: {
    subjectsOf: reposOfRun,
    emptyError:
      "This row opens one scaffold run per repo, and no repos are registered on this " +
      "engagement. Nothing was opened — register the repos first.",
    mode: "inline",
  },
};

/**
 * The published version of the workflow a task's row nests, resolved the engagement-override-wins
 * way `open_workflow_run` does. Shared by `nestedFanOutKind` and `materializeInlinePerSubject` so
 * there is one place this resolution happens, not two that could disagree on which version a run
 * is actually using.
 */
async function resolveNestedVersion(taskId: string): Promise<{
  orgId: string;
  engagementId: string;
  runId: string | null;
  code: string;
  versionId: string;
  ownerRoleCode: string | null;
  workstreamCode: string | null;
} | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: task } = await sb
    .from("work_task")
    .select("org_id, engagement_id, workflow_run_id, workflow_step_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task?.workflow_step_id) return null;

  const { data: step } = await sb
    .from("workflow_step")
    .select("nests_workflow_code")
    .eq("id", task.workflow_step_id)
    .maybeSingle();
  const code = step?.nests_workflow_code as string | null;
  if (!code) return null;

  // The engagement's override wins over the org default — reading the org copy here would answer
  // for a workflow this run is not using.
  const { data: wf } = await sb
    .from("workflow")
    .select("id, owner_role_code, workstream_code")
    .eq("org_id", task.org_id)
    .eq("code", code)
    .or(`engagement_id.eq.${task.engagement_id},engagement_id.is.null`)
    .order("engagement_id", { nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!wf) return null;

  const { data: ver } = await sb
    .from("workflow_version")
    .select("id")
    .eq("workflow_id", wf.id)
    .eq("status", "published")
    .maybeSingle();
  if (!ver) return null;

  return {
    orgId: task.org_id as string,
    engagementId: task.engagement_id as string,
    runId: (task.workflow_run_id as string | null) ?? null,
    code,
    versionId: ver.id as string,
    ownerRoleCode: (wf.owner_role_code as string | null) ?? null,
    workstreamCode: (wf.workstream_code as string | null) ?? null,
  };
}

/** Which fan-out kind (if any) the nested workflow's own steps declare, from its published version. */
async function nestedFanOutKind(taskId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const resolved = await resolveNestedVersion(taskId);
  if (!resolved) return null;

  const { data: steps } = await sb
    .from("workflow_step")
    .select("produces")
    .eq("workflow_version_id", resolved.versionId);
  const produces = (steps ?? []).map((s) => s.produces as string | null);

  for (const kind of Object.keys(FAN_OUT_KINDS)) {
    if (produces.some((p) => p?.includes(`{${kind}}`))) return kind;
  }
  return null;
}

/**
 * Copy the template workflow's criteria into the PARENT run's own version, once per step_task that
 * does not already have a row there. Idempotent — safe to call on every materialize, including a
 * retry.
 *
 * Why a copy, not a second lookup path: `criteriaForTask` (`gates/measure.ts`) resolves criteria by
 * the RUN's `workflow_version_id` plus the step's `task` name — every task in the system is read
 * this way. A materialized task sits in the parent run but keeps the TEMPLATE's own
 * `workflow_step_id`, so without this copy its criteria would be registered under a version
 * `criteriaForTask` never looks at, and every Ready/Done gate on it would silently find nothing.
 * Copying the rows keeps that one widely-used function completely unchanged — teaching it a second
 * lookup path risks every OTHER workflow's gates, not just this one's.
 */
async function copyCriteriaIfMissing(
  templateVersionId: string,
  parentVersionId: string,
  stepTasks: string[],
): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb || templateVersionId === parentVersionId || !stepTasks.length) return;

  const { data: existing } = await sb
    .from("criterion")
    .select("step_task")
    .eq("workflow_version_id", parentVersionId)
    .in("step_task", stepTasks);
  const have = new Set((existing ?? []).map((r) => r.step_task as string));

  const { data: template } = await sb
    .from("criterion")
    .select("kind, ord, statement, subject_kind, subject_ref, operator, value, step_task")
    .eq("workflow_version_id", templateVersionId)
    .in("step_task", stepTasks);

  const rows = (template ?? [])
    .filter((c) => c.step_task && !have.has(c.step_task as string))
    .map((c) => ({ ...c, workflow_version_id: parentVersionId }));
  if (rows.length) await sb.from("criterion").insert(rows);
}

/**
 * The `inline` fan-out mode — materialize a nested workflow's steps as plain tasks INSIDE the
 * calling run, once per subject, instead of opening a second-level nested run.
 *
 * See `FAN_OUT_KINDS`'s own comment for why: Jira's hierarchy caps at one level below an epic, and
 * `scaffold-repos` already sits one level nested under `sprint-0`'s `foundation-architecture` — a
 * second nested run per repo cannot be mirrored (`mirrorNested` correctly refuses it as "nested two
 * deep"). This stays flat instead: no second run, so no second nesting level, ever.
 *
 * IDEMPOTENT per (run, subject, step) — a retry or a second click does not clone a second copy of a
 * subject's pair, same discipline `open_nested_run`'s own idempotency gives the `nest` mode.
 */
async function materializeInlinePerSubject(
  actor: Actor,
  taskId: string,
  subjects: FanOutSubject[],
  emptyError: string,
): Promise<FanOutResult> {
  if (!subjects.length) return { ok: false, error: emptyError };

  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const resolved = await resolveNestedVersion(taskId);
  if (!resolved) return { ok: false, error: "This row's nested workflow could not be resolved." };
  if (!resolved.runId) return { ok: false, error: "This row has no run to materialize into." };
  const runId = resolved.runId;

  const { data: parentRun } = await sb
    .from("workflow_run")
    .select("id, workflow_version_id")
    .eq("id", runId)
    .maybeSingle();
  if (!parentRun) return { ok: false, error: "This row's own run could not be found." };

  const { data: templateSteps } = await sb
    .from("workflow_step")
    .select("id, ord, kind, role_code, task, title")
    .eq("workflow_version_id", resolved.versionId)
    .order("ord");
  if (!templateSteps?.length) {
    return { ok: false, error: `'${resolved.code}' has no steps to materialize.` };
  }

  await copyCriteriaIfMissing(
    resolved.versionId,
    parentRun.workflow_version_id as string,
    templateSteps.map((s) => s.task as string),
  );

  const subjectRefs = subjects.map((s) => s.ref);
  const { data: existing } = await sb
    .from("work_task")
    .select("subject_ref, workflow_step_id")
    .eq("workflow_run_id", runId)
    .in("subject_ref", subjectRefs);
  const already = new Set((existing ?? []).map((r) => `${r.subject_ref}:${r.workflow_step_id}`));

  const rows = subjects.flatMap((subject) =>
    templateSteps
      .filter((step) => !already.has(`${subject.ref}:${step.id}`))
      .map((step) => ({
        org_id: resolved.orgId,
        engagement_id: resolved.engagementId,
        workflow_run_id: runId,
        workflow_step_id: step.id as string,
        subject_ref: subject.ref,
        role_code: (step.role_code as string | null) ?? resolved.ownerRoleCode,
        kind: step.kind === "hitl" ? "hitl" : "agent",
        title: (step.title as string) || (step.task as string) || `Step ${step.ord}`,
        created_by: actor.holder ?? actor.roleCode,
        workstream_code: resolved.workstreamCode,
      })),
  );

  if (rows.length) {
    const { error } = await sb.from("work_task").insert(rows);
    if (error) return { ok: false, error: error.message };
  }

  // One mirror pass for the whole run, not one per subject — `mirrorNested` already skips any task
  // that already has a ticket and creates one for anything new, so a single call after every
  // subject's rows exist picks up exactly what this call added. Reused unchanged by every subject's
  // entry below: it is genuinely the same board result, since they all share one run.
  const mirrored = await mirrorAndCompose(
    resolved.engagementId,
    runId,
    actor.roleCode,
    () => mirrorNested(resolved.engagementId, runId, actor.roleCode),
    { taskLevel: "subtask" },
  );

  await remeasureRun(actor, runId);

  const { data: runTasks } = await sb
    .from("work_task")
    .select("id, subject_ref, role_code, workflow_step(ord)")
    .eq("workflow_run_id", runId)
    .in("subject_ref", subjectRefs);

  // Same rule `openNested` applies: auto-start a subject's first materialized task only when it
  // belongs to the SAME role that triggered the fan-out. A different role's task is left idle in
  // its own queue.
  const runs: { runId: string; subject: string | null; mirrored: BoardResult; startedTaskId: string | null }[] = [];
  for (const subject of subjects) {
    const forSubject = (runTasks ?? []).filter((t) => t.subject_ref === subject.ref);
    const first = sortByStep(forSubject)[0] ?? null;
    let startedTaskId: string | null = null;
    if (first?.role_code === actor.roleCode) {
      const started = await startTask(actor, first.id as string).catch(() => null);
      if (started?.ok) startedTaskId = first.id as string;
    }
    runs.push({ runId, subject: subject.ref, mirrored, startedTaskId });
  }

  return { ok: true, runs };
}

/**
 * Open one child run per subject, or refuse if there are none.
 *
 * FANNING OUT OVER ZERO SUBJECTS REFUSES. `for (const s of [])` completes, the row closes, and a
 * fan-out that opened nothing looks exactly like one that opened everything — the aggregate-over-
 * no-rows failure this repo keeps re-learning (rule 11). Shared by every kind in `FAN_OUT_KINDS`;
 * only the subject list and the empty-case message differ between them.
 */
async function openNestedPerSubject(
  actor: Actor,
  taskId: string,
  subjects: FanOutSubject[],
  emptyError: string,
): Promise<FanOutResult> {
  if (!subjects.length) return { ok: false, error: emptyError };

  const runs: {
    runId: string;
    subject: string | null;
    mirrored: BoardResult;
    startedTaskId: string | null;
  }[] = [];
  for (const subject of subjects) {
    const child = await openNested(actor, taskId, subject.ref);
    // One subject failing does not silently drop the rest: the others still open, and the failure
    // is returned rather than logged nowhere. A partial fan-out is honest; a quiet one is not.
    if (!child.ok)
      return { ok: false, error: `${subject.ref}: ${child.error}` };
    runs.push({
      runId: child.runId,
      subject: subject.ref,
      mirrored: child.mirrored,
      startedTaskId: child.startedTaskId,
    });
  }
  return { ok: true, runs };
}

/** The epics drafted in this task's own run — what the fan-out opens a design for. */
async function epicsOfRun(taskId: string): Promise<FanOutSubject[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: task } = await sb
    .from("work_task")
    .select("workflow_run_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task?.workflow_run_id) return [];

  // Every task of this run, because the epics belong to whichever row drafted them — this row only
  // knows it comes after.
  const { data: siblings } = await sb
    .from("work_task")
    .select("id")
    .eq("workflow_run_id", task.workflow_run_id);
  const ids = (siblings ?? []).map((s) => s.id as string);
  if (!ids.length) return [];

  const { data: items } = await sb
    .from("backlog_item")
    .select("ref")
    .in("task_id", ids)
    .eq("kind", "epic")
    .order("ord");
  return (items ?? []).map((i) => ({ ref: i.ref as string }));
}

/**
 * The repos registered on this task's engagement — what `scaffold-repos` opens a build for.
 *
 * By ENGAGEMENT, not by run: unlike epics (drafted fresh inside the run that fans out over them),
 * repos are registered once, by `accept-scaffold`, and `repo` carries no `workflow_run_id` of its
 * own to scope by — there is exactly one live scaffold-acceptance cycle per engagement in practice.
 */
async function reposOfRun(taskId: string): Promise<FanOutSubject[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: task } = await sb
    .from("work_task")
    .select("engagement_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task?.engagement_id) return [];

  const { data: repos } = await sb
    .from("repo")
    .select("key")
    .eq("engagement_id", task.engagement_id)
    .order("ord");
  return (repos ?? [])
    .filter((r) => r.key)
    .map((r) => ({ ref: r.key as string }));
}
