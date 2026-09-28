import { supabaseAdmin } from "../../supabase";
import type { Actor } from "../actor";
import { orgIdFor } from "../events";

/** Does this task's row nest a workflow? The queue needs to know — it changes what the button does. */
export async function nestedWorkflowOf(taskId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data: task } = await sb
    .from("work_task")
    .select("workflow_step_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task?.workflow_step_id) return null;
  const { data: step } = await sb
    .from("workflow_step")
    .select("nests_workflow_code")
    .eq("id", task.workflow_step_id)
    .maybeSingle();
  return step?.nests_workflow_code ?? null;
}

/**
 * The child runs a nesting row has opened, and the rows inside each.
 *
 * `nestedWorkflowOf` says the row is satisfied by a workflow; this says what happened when someone
 * started it. Both are needed by the same surface, because "you started it and these five rows
 * opened" and "you have not started it yet" are different screens, and until now the job page
 * showed neither — it offered a Run button that could only ever be refused.
 *
 * `evaluateNested` already makes the run half of this query to decide whether the row's gate is
 * met. This widens it to carry the tasks, because a person needs to SEE the work, not be told a
 * count of it. The gate stays the authority on whether the row is done; this is for reading.
 *
 * Ordered by `ord`, the same order the child run's own queue uses, so the list here and the list
 * there cannot disagree about which row comes first.
 */
export async function childRunsOf(
  actor: Actor,
  taskId: string,
): Promise<
  {
    runId: string;
    state: string;
    subject: string | null;
    tasks: {
      id: string;
      title: string;
      roleCode: string;
      state: string;
      ticketKey: string | null;
    }[];
  }[]
> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: runs, error: runsError } = await sb
    .from("workflow_run")
    .select("id, state, subject_key, opened_at")
    .eq("engagement_id", actor.engagementId)
    .eq("parent_task_id", taskId)
    .order("opened_at");
  if (runsError) throw new Error(`read child runs: ${runsError.message}`);
  if (!runs?.length) return [];

  // One query for every child's rows rather than one per run — a fan-out opens one run per epic,
  // and a per-run query would grow with the backlog.
  //
  // `ord` lives on `workflow_step`, not `work_task` — there is no such column here to select or
  // order by directly. Embedding the step (the same to-one join `tasksFor`'s own SELECT already
  // uses) and sorting on the embedded value is the fix; selecting a nonexistent column failed the
  // whole query, and `tasks ?? []` below turned that failure into a silent "no rows", which is what
  // made every open nesting run report itself as empty.
  const { data: tasks, error: tasksError } = await sb
    .from("work_task")
    .select(
      "id, title, role_code, state, ticket_key, workflow_run_id, workflow_step(ord)",
    )
    .in(
      "workflow_run_id",
      runs.map((r) => r.id as string),
    );
  if (tasksError)
    throw new Error(`read child run tasks: ${tasksError.message}`);
  const ordOf = (t: {
    workflow_step: { ord: number | null }[] | { ord: number | null } | null;
  }) => {
    const step = Array.isArray(t.workflow_step)
      ? t.workflow_step[0]
      : t.workflow_step;
    return step?.ord ?? 0;
  };
  tasks?.sort((a, b) => ordOf(a) - ordOf(b));

  return runs.map((r) => ({
    runId: r.id as string,
    state: r.state as string,
    subject: (r.subject_key as string | null) ?? null,
    tasks: (tasks ?? [])
      .filter((t) => t.workflow_run_id === r.id)
      .map((t) => ({
        id: t.id as string,
        title: t.title as string,
        roleCode: t.role_code as string,
        state: t.state as string,
        ticketKey: (t.ticket_key as string | null) ?? null,
      })),
  }));
}

/**
 * Which phases exist for this engagement, and whether each has a run.
 *
 * It does NOT evaluate entry gates — `available` means "no run yet", not "ready to start". The
 * gate is checked by `initiatePhase`, which refuses and names the unmet criterion. Saying so here
 * because the docstring originally claimed otherwise, and a caller trusting it would render a
 * button as ready that is not.
 */
export async function phasesFor(actor: Actor): Promise<
  {
    code: string;
    label: string;
    state: "open" | "closed" | "available";
    runId: string | null;
    onBoard: boolean | null;
  }[]
> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const orgId = await orgIdFor(actor.engagementId);

  const { data: wfs } = await sb
    .from("workflow")
    .select("id, code, label, repeatable")
    .eq("org_id", orgId)
    .eq("owner_role_code", actor.roleCode)
    .eq("enabled", true);

  const nested = await nestedByOpenRun(actor.engagementId);

  const { data: runs } = await sb
    .from("workflow_run")
    .select("id, workflow_id, state, ticket_key, opened_at")
    .eq("engagement_id", actor.engagementId)
    .is("parent_task_id", null)
    .order("opened_at", { ascending: false });

  // The LATEST run per workflow. A repeating phase has many, and a Map built from an unordered list
  // would show whichever the database happened to return — "closed" over a sprint that is actually
  // in flight, or the reverse. Ordered newest-first above, so the first write wins.
  type Run = NonNullable<typeof runs>[number];
  const runOf = new Map<string, Run>();
  for (const r of runs ?? []) {
    if (!runOf.has(r.workflow_id as string))
      runOf.set(r.workflow_id as string, r);
  }

  // One query for every run's ticketless tasks rather than one per phase.
  const { data: unticketed } = await sb
    .from("work_task")
    .select("workflow_run_id")
    .eq("engagement_id", actor.engagementId)
    .is("ticket_key", null);

  const missing = new Set(
    (unticketed ?? []).map((t) => t.workflow_run_id as string),
  );

  return (wfs ?? [])
    .filter((w) => {
      const hidden = nested.has(w.code as string);
      return !hidden || Boolean(runOf.get(w.id));
    })
    .map((w) => {
      const run = runOf.get(w.id);
      return {
        code: w.code,
        label: w.label,

        state: run
          ? run.state === "closed"
            ? w.repeatable
              ? ("available" as const)
              : ("closed" as const)
            : ("open" as const)
          : ("available" as const),
        runId: run?.id ?? null,
        onBoard: run ? Boolean(run.ticket_key) && !missing.has(run.id) : null,
      };
    });
}

/**
 * Workflow codes that a currently open run's steps nest.
 *
 * Derived from the steps rather than a column on `workflow` or a list of names here: nesting is
 * already stated once, in `workflow_step.nests_workflow_code`, and a second place saying the same
 * thing is a second thing to keep true. This repo has made the carry-the-literal mistake before.
 *
 * FAILS OPEN, deliberately. An unreadable step table yields an empty set and the phase list is
 * whatever it was before — offering too much, which a person can refuse, rather than hiding a
 * phase with no way to find out why. The direction is chosen; it is not an accident.
 */
async function nestedByOpenRun(engagementId: string): Promise<Set<string>> {
  const sb = supabaseAdmin();
  if (!sb) return new Set();

  const { data: runs } = await sb
    .from("workflow_run")
    .select("workflow_version_id")
    .eq("engagement_id", engagementId)
    .neq("state", "closed");
  const versions = [
    ...new Set(
      (runs ?? []).map((r) => r.workflow_version_id as string).filter(Boolean),
    ),
  ];
  if (!versions.length) return new Set();

  const { data: steps } = await sb
    .from("workflow_step")
    .select("nests_workflow_code")
    .in("workflow_version_id", versions)
    .not("nests_workflow_code", "is", null);

  return new Set(
    (steps ?? []).map((s) => s.nests_workflow_code as string).filter(Boolean),
  );
}
