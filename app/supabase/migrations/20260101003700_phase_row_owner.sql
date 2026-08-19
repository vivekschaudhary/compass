-- A machine-checked row still belongs to someone.
--
-- `open_phase_run` inserted a task straight from the step, and basecamp's first row — "Connect
-- systems of record" — is a machine check, so its step holds NO role_code (the schema forbids one:
-- nobody performs a machine check). But work_task.role_code is NOT NULL, and rightly: a task in
-- nobody's queue is a task nobody sees.
--
-- Those two facts are both correct and they meet here. Performing and being ACCOUNTABLE are
-- different: nothing dispatches for that row, and the delivery manager still owns whether the
-- systems of record answer. So the task falls to the workflow's owner when the step names no role.

create or replace function open_phase_run(
  p_org_id uuid, p_engagement_id text, p_workflow_code text,
  p_actor text default null, p_actor_role text default null
) returns uuid as $$
declare
  v_run_id uuid;
  v_ver    uuid;
  v_owner  text;
  v_step   workflow_step%rowtype;
  v_made   int := 0;
begin
  v_run_id := open_workflow_run(p_org_id, p_engagement_id, p_workflow_code, p_actor, p_actor_role);

  select r.workflow_version_id, w.owner_role_code
    into v_ver, v_owner
    from workflow_run r join workflow w on w.id = r.workflow_id
   where r.id = v_run_id;

  for v_step in
    select * from workflow_step
     where workflow_version_id = v_ver
       and conditional is null
       and ord > (select min(ord) from workflow_step
                   where workflow_version_id = v_ver and conditional is null)
     order by ord
  loop
    insert into work_task (org_id, engagement_id, workflow_run_id, workflow_step_id,
                           role_code, kind, title, created_by)
    values (p_org_id, p_engagement_id, v_run_id, v_step.id,
            coalesce(v_step.role_code, v_owner),
            case when v_step.kind = 'hitl' then 'hitl' else 'agent' end,
            coalesce(nullif(v_step.task, ''), 'Step ' || v_step.ord),
            p_actor);
    v_made := v_made + 1;
  end loop;

  insert into event (org_id, engagement_id, actor_kind, actor_role_code, actor_user_id,
                     subject_type, subject_id, verb, payload)
  values (p_org_id, p_engagement_id, 'human', p_actor_role, p_actor,
          'workflow_run', v_run_id, 'phase.initiated',
          jsonb_build_object('workflow', p_workflow_code, 'tasks', v_made + 1));

  return v_run_id;
end;
$$ language plpgsql;
