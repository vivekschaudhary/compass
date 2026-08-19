-- Create tasks with the row's title.
--
-- Both routines fell back to something that reads badly in a queue: open_workflow_run used the
-- WORKFLOW's label (a task called "Basecamp" inside the basecamp run) and open_phase_run used the
-- task slug ("propose-kickoff-backlog"). The title column now exists; this is the half that uses it.
-- The fallback chain is title → task slug → "Step N", so a row with no title is still identifiable
-- rather than blank.

create or replace function open_phase_run(
  p_org_id uuid, p_engagement_id text, p_workflow_code text,
  p_actor text default null, p_actor_role text default null
) returns uuid as $$
declare
  v_run_id uuid; v_ver uuid; v_owner text; v_step workflow_step%rowtype; v_made int := 0;
begin
  v_run_id := open_workflow_run(p_org_id, p_engagement_id, p_workflow_code, p_actor, p_actor_role);

  select r.workflow_version_id, w.owner_role_code into v_ver, v_owner
    from workflow_run r join workflow w on w.id = r.workflow_id where r.id = v_run_id;

  for v_step in
    select * from workflow_step
     where workflow_version_id = v_ver and conditional is null
       and ord > (select min(ord) from workflow_step
                   where workflow_version_id = v_ver and conditional is null)
     order by ord
  loop
    insert into work_task (org_id, engagement_id, workflow_run_id, workflow_step_id,
                           role_code, kind, title, created_by)
    values (p_org_id, p_engagement_id, v_run_id, v_step.id,
            coalesce(v_step.role_code, v_owner),
            case when v_step.kind = 'hitl' then 'hitl' else 'agent' end,
            coalesce(nullif(v_step.title, ''), nullif(v_step.task, ''), 'Step ' || v_step.ord),
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

create or replace function open_workflow_run(
  p_org_id uuid, p_engagement_id text, p_workflow_code text,
  p_actor text default null, p_actor_role text default null
) returns uuid as $$
declare
  v_wf workflow%rowtype; v_ver workflow_version%rowtype;
  v_step workflow_step%rowtype; v_run_id uuid;
begin
  perform compass_set_actor(p_actor, p_actor_role, 'human');

  select * into v_wf from workflow
   where org_id = p_org_id and code = p_workflow_code
     and (engagement_id = p_engagement_id or engagement_id is null)
   order by engagement_id nulls last limit 1;
  if not found then
    raise exception 'No workflow % for this org. Import it before opening a run.', p_workflow_code;
  end if;

  select * into v_ver from workflow_version where workflow_id = v_wf.id and status = 'published';
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
   where workflow_version_id = v_ver.id and conditional is null order by ord limit 1;
  if found then
    insert into work_task (org_id, engagement_id, workflow_run_id, workflow_step_id,
                      role_code, kind, title, created_by)
    values (p_org_id, p_engagement_id, v_run_id, v_step.id,
            coalesce(v_step.role_code, v_wf.owner_role_code),
            case when v_step.kind = 'hitl' then 'hitl' else 'agent' end,
            coalesce(nullif(v_step.title, ''), v_wf.label),
            p_actor);
  end if;

  return v_run_id;
end;
$$ language plpgsql;
