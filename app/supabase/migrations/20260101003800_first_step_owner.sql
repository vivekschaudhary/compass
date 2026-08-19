-- Same fix, in the place it actually bites.
--
-- 003700 made `open_phase_run` fall back to the workflow's owner when a step names no role. It was
-- still refused, because the FIRST task is not created by that loop — it comes from
-- `open_workflow_run`, which 003700 reused and did not touch. Basecamp's first row is a machine
-- check with no role_code, so the insert failed before the loop ran.
--
-- Fixing the caller and not the callee is how a bug survives its own fix. The fallback belongs
-- here, where every run creates its first task, and it is right for any workflow: performing and
-- being accountable are different, and a task in nobody's queue is a task nobody sees.

create or replace function open_workflow_run(
  p_org_id uuid, p_engagement_id text, p_workflow_code text,
  p_actor text default null, p_actor_role text default null
) returns uuid as $$
declare
  v_wf      workflow%rowtype;
  v_ver     workflow_version%rowtype;
  v_step    workflow_step%rowtype;
  v_run_id  uuid;
begin
  perform compass_set_actor(p_actor, p_actor_role, 'human');

  select * into v_wf from workflow
   where org_id = p_org_id and code = p_workflow_code
     and (engagement_id = p_engagement_id or engagement_id is null)
   order by engagement_id nulls last limit 1;
  if not found then
    raise exception 'No workflow % for this org. Import it before opening a run.', p_workflow_code;
  end if;

  select * into v_ver from workflow_version
   where workflow_id = v_wf.id and status = 'published';
  if not found then
    raise exception 'Workflow % has no published version.', p_workflow_code;
  end if;

  insert into workflow_run (org_id, engagement_id, workflow_id, workflow_version_id,
                            owner_role_code, opened_by)
  values (p_org_id, p_engagement_id, v_wf.id, v_ver.id, v_wf.owner_role_code, p_actor)
  returning id into v_run_id;

  insert into event (org_id, engagement_id, actor_kind, actor_role_code, actor_user_id,
                     subject_type, subject_id, verb, payload)
  values (p_org_id, p_engagement_id, 'human', p_actor_role, p_actor,
          'workflow_run', v_run_id, 'workflow.opened',
          jsonb_build_object('workflow', p_workflow_code, 'version', v_ver.version));

  select * into v_step from workflow_step
   where workflow_version_id = v_ver.id and conditional is null
   order by ord limit 1;
  if found then
    insert into work_task (org_id, engagement_id, workflow_run_id, workflow_step_id,
                      role_code, kind, title, created_by)
    values (p_org_id, p_engagement_id, v_run_id, v_step.id,
            coalesce(v_step.role_code, v_wf.owner_role_code),   -- ← the fix
            case when v_step.kind = 'hitl' then 'hitl' else 'agent' end,
            v_wf.label, p_actor);
  end if;

  return v_run_id;
end;
$$ language plpgsql;
