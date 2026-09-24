-- open_workflow_run_all_steps.sql — every run gets every one of its steps' rows, at open. Not
-- just a phase's.
--
-- THE GAP THIS CLOSES. `open_phase_run` called `open_workflow_run` (which created only the FIRST
-- step), then looped over every remaining step itself. That loop was phase-only — `open_nested_run`
-- calls `open_workflow_run` directly, so a nested workflow like `timeline` (draft-timeline →
-- approve-timeline, depends_on draft-timeline) only ever got its first step's row. Nothing ever
-- created the second one: not a trigger, not a TS path, nothing. `depends_on` had no way to matter
-- for a sequential nested workflow because there was never a second row for it to gate.
--
-- THE FIX IS IN ONE PLACE, NOT TWO. `open_workflow_run` now does what `open_phase_run`'s loop used
-- to do, for every caller — a phase and a nested workflow are the same kind of thing opening, and
-- carrying that loop in two functions was already a duplicate to keep in agreement (this repo has
-- been bitten by exactly that shape before). `open_phase_run` is DROPPED, not deprecated:
-- `initiatePhase` (phases.ts) is its only caller and now calls `open_workflow_run` directly.
--
-- `open_phase_run`'s own SQL-level `phase.initiated` event goes with it. It was a genuine
-- duplicate: `initiatePhase` (TS) already writes its own `phase.initiated` event, with an accurate
-- row count read from `tasksOfRun` after the fact, unconditionally, whether or not this RPC is the
-- one that opened the run. Losing the SQL-side copy removes a double-write, not a capability.

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

  -- EVERY non-conditional step, not just the first — see the header. Title fallback is the fuller
  -- three-level chain `open_phase_run`'s loop already used (title → task slug → "Step N"), applied
  -- uniformly now rather than only step 1 falling back to the workflow's own label.
  for v_step in
    select * from workflow_step
     where workflow_version_id = v_ver.id and conditional is null
     order by ord
  loop
    insert into work_task (org_id, engagement_id, workflow_run_id, workflow_step_id,
                      role_code, kind, title, created_by)
    values (p_org_id, p_engagement_id, v_run_id, v_step.id,
            coalesce(v_step.role_code, v_wf.owner_role_code),
            case when v_step.kind = 'hitl' then 'hitl' else 'agent' end,
            coalesce(nullif(v_step.title, ''), nullif(v_step.task, ''), 'Step ' || v_step.ord),
            p_actor);
  end loop;

  return v_run_id;
end;
$$ language plpgsql;

-- DROPPED, NOT REPLACED. `initiatePhase` (phases.ts) is updated in this same change to call
-- `open_workflow_run` directly — this repo has been bitten before by a function left in place
-- after its caller moved on, so it goes rather than lingering as dead, misleading surface.
drop function if exists open_phase_run(uuid, text, text, text, text);

-- The migration asserts its own effect.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'open_phase_run') then
    raise exception 'open_phase_run should have been dropped';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_language l on l.oid = p.prolang
    where p.proname = 'open_workflow_run' and l.lanname = 'plpgsql'
  ) then
    raise exception 'open_workflow_run is missing';
  end if;
end $$;
