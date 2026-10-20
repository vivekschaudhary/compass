-- top_level_run_subject.sql — a run opened on its own can be ABOUT one thing.
--
-- Until now only a NESTED run carried a subject (`open_nested_run`, `workflow_run.subject_ref`): the
-- per-epic technical design is opened by a row of a parent run, one child per epic. A workflow a
-- person starts directly had no subject, and `initiatePhase` returns the already-open run for a
-- workflow rather than opening a second — so "refine the stories of THIS epic" could not be started
-- more than once, and a path naming `{epic}` could not be filled for it.
--
-- This gives `open_workflow_run` the same optional subject. A run opened without one behaves
-- exactly as before.
--
-- ONE OPEN RUN PER (engagement, workflow, subject). Two concurrent starts for the same epic would
-- otherwise both see no existing run and both insert; the index is what makes the idempotency in
-- `initiatePhase` a guarantee instead of a hope. Partial: a closed run must not block starting the
-- same subject again, and a run with no subject keeps its existing rule (one open per workflow),
-- which `initiatePhase` enforces by looking before it opens.
--
-- DROPPED, NOT REPLACED. `create or replace` with a new defaulted argument does not replace the
-- 5-argument function — it creates a second one, and every existing 5-argument call then matches
-- both and fails as ambiguous. The old signature has to go first.

drop function if exists open_workflow_run(uuid, text, text, text, text);

create or replace function open_workflow_run(
  p_org_id uuid, p_engagement_id text, p_workflow_code text,
  p_actor text default null, p_actor_role text default null,
  p_subject_ref text default null
) returns uuid as $$
declare
  v_wf workflow%rowtype; v_ver workflow_version%rowtype;
  v_step workflow_step%rowtype; v_run_id uuid;
  v_role_code text; v_role_ws text;
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
                            owner_role_code, opened_by, subject_ref)
  values (p_org_id, p_engagement_id, v_wf.id, v_ver.id, v_wf.owner_role_code, p_actor,
          nullif(btrim(p_subject_ref), ''))
  returning id into v_run_id;

  insert into event (org_id, engagement_id, actor_kind, actor_role_code, actor_user_id,
                     subject_type, subject_id, verb, payload)
  values (p_org_id, p_engagement_id, 'human', p_actor_role, p_actor,
          'workflow_run', v_run_id, 'workflow.opened',
          jsonb_build_object('workflow', p_workflow_code, 'version', v_ver.version,
                             'subject', nullif(btrim(p_subject_ref), '')));

  for v_step in
    select * from workflow_step
     where workflow_version_id = v_ver.id and conditional is null
     order by ord
  loop
    v_role_code := coalesce(v_step.role_code, v_wf.owner_role_code);

    select r.workstream_code into v_role_ws
      from role r
     where r.org_id = p_org_id and r.code = v_role_code
       and (r.engagement_id = p_engagement_id or r.engagement_id is null)
     order by r.engagement_id nulls last
     limit 1;

    insert into work_task (org_id, engagement_id, workflow_run_id, workflow_step_id,
                      role_code, kind, title, created_by, workstream_code)
    values (p_org_id, p_engagement_id, v_run_id, v_step.id,
            v_role_code,
            case when v_step.kind = 'hitl' then 'hitl' else 'agent' end,
            coalesce(nullif(v_step.title, ''), nullif(v_step.task, ''), 'Step ' || v_step.ord),
            p_actor, coalesce(v_role_ws, v_wf.workstream_code));

    v_role_ws := null;
  end loop;

  return v_run_id;
end;
$$ language plpgsql;

create unique index if not exists workflow_run_one_open_top_level_per_subject
  on workflow_run (engagement_id, workflow_id, subject_ref)
  where parent_task_id is null and subject_ref is not null and state = 'open';

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
declare v_overloads int; v_has_subject boolean; v_index boolean;
begin
  select count(*) into v_overloads from pg_proc where proname = 'open_workflow_run';
  if v_overloads <> 1 then
    raise exception 'expected exactly one open_workflow_run, found % (an ambiguous overload)', v_overloads;
  end if;

  select exists (
    select 1 from pg_proc p
     where p.proname = 'open_workflow_run' and p.pronargs = 6
  ) into v_has_subject;
  if not v_has_subject then
    raise exception 'open_workflow_run does not take a subject';
  end if;

  select exists (
    select 1 from pg_indexes where indexname = 'workflow_run_one_open_top_level_per_subject'
  ) into v_index;
  if not v_index then
    raise exception 'workflow_run_one_open_top_level_per_subject was not created';
  end if;
end $$;
