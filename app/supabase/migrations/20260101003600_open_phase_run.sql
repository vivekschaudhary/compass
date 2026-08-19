-- Initiating a phase creates all of its rows.
--
-- `open_workflow_run` creates the FIRST step's task and stops, which is right for a sequential
-- workflow: `build` reveals step 2 when step 1 closes, because what step 2 does depends on what
-- step 1 produced. A phase is not that. Basecamp's three rows and groundwork's five are known the
-- moment the phase begins, they have declared dependencies between them, and a delivery manager
-- needs to SEE the whole phase — the point of a kickoff backlog is that nothing in it is a
-- surprise. Materialising one row at a time would hide the plan behind the plan.
--
-- So this is a second front door, not an argument on the first. The refusals differ too: opening a
-- run is a decision, initiating a phase is a commitment to everything in it.

create or replace function open_phase_run(
  p_org_id uuid, p_engagement_id text, p_workflow_code text,
  p_actor text default null, p_actor_role text default null
) returns uuid as $$
declare
  v_run_id  uuid;
  v_ver     uuid;
  v_step    workflow_step%rowtype;
  v_made    int := 0;
begin
  -- Reuse the routine rather than reimplementing it. It sets the actor, refuses an unknown or
  -- unpublished workflow, emits `workflow.opened`, and creates the first step's task.
  v_run_id := open_workflow_run(p_org_id, p_engagement_id, p_workflow_code, p_actor, p_actor_role);

  select workflow_version_id into v_ver from workflow_run where id = v_run_id;

  -- Every remaining step. `conditional` steps are excluded for the same reason open_workflow_run
  -- excludes them: a step that only runs under a condition is not work anyone is committed to yet,
  -- and putting it in someone's queue on day one would be a lie about the plan.
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
            v_step.role_code,
            case
              when v_step.kind = 'hitl'    then 'hitl'
              -- A nesting row and a machine check are both worked by an agent-shaped task: the
              -- nesting one opens its child run, the machine one is satisfied by its own check.
              -- work_task.kind has no 'workflow' or 'machine' member and does not need one — how a
              -- task is satisfied is the STEP's business, and duplicating it here would create a
              -- second answer to the same question.
              else 'agent'
            end,
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
