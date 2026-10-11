import { supabaseAdmin } from "../supabase";

/**
 * The published version of the workflow a task's row nests, resolved the engagement-override-wins
 * way `open_workflow_run` does.
 *
 * Its own file, not a function on `phases/nested.ts`, so a gate evaluator can read it without
 * importing `phases/nested.ts` — that file pulls in `../gates` (for `remeasureRun`), and `../gates`
 * (`registry.ts`) is what dispatches TO the evaluators. An evaluator importing `phases/nested.ts`
 * would close that loop: `registry.ts` → the evaluator → `phases/nested.ts` → `../gates` →
 * `registry.ts`. Both `phases/nested.ts` (`nestedFanOutKind`, `materializeInlinePerSubject`) and
 * `gates/evaluators/inline-fanout.ts` import this instead, so the resolution happens in exactly one
 * place without either of them importing the other.
 */
export async function resolveNestedVersion(taskId: string): Promise<{
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
