-- work_task_workstream_code.sql — a task carries the workstream its own workflow belongs to,
-- because nothing ever set it.
--
-- `work_task.workstream_code` has existed since 024 (workspace_execution) and `tasksFor` has
-- always read it — a `workstream`-scoped role (`researcher`, `staff-engineer`) is filtered by
-- `eq("workstream_code", actor.workstreamCode)`, and the `everyone`/`workstream`-scoped breadth
-- also feeds `mineQueued`/`totalQueued` in `jobs/page.tsx`, which decides which empty-state banner
-- a queue shows. But `open_workflow_run`'s insert into `work_task` never named the column, so every
-- row in every engagement has `workstream_code = null` — checked directly: all 19 tasks on a live
-- engagement, zero exceptions. `eq(..., null)` never matches, so a `workstream`-scoped role's own
-- queue query returns nothing, always, regardless of what is actually assigned to them. A
-- researcher's own `gather-evidence` row existed, was `idle`, was theirs to start — and never
-- appeared on their Jobs to do page.
--
-- `TasksTable` ALREADY narrows to the viewer's own `role_code` client-side, whatever the scope —
-- this is not a second way to filter down to "mine". Fixing the column fixes both things it feeds
-- at once: the viewer's own rows reach that narrowing step at all, and the workstream-wide count
-- `mineQueued`/`totalQueued` compares against stops always reading zero.

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

  -- EVERY non-conditional step, not just the first — see 20260924220000's header. Title fallback
  -- is the fuller three-level chain `open_phase_run`'s loop already used (title → task slug →
  -- "Step N"), applied uniformly now rather than only step 1 falling back to the workflow's own
  -- label.
  for v_step in
    select * from workflow_step
     where workflow_version_id = v_ver.id and conditional is null
     order by ord
  loop
    insert into work_task (org_id, engagement_id, workflow_run_id, workflow_step_id,
                      role_code, kind, title, created_by, workstream_code)
    values (p_org_id, p_engagement_id, v_run_id, v_step.id,
            coalesce(v_step.role_code, v_wf.owner_role_code),
            case when v_step.kind = 'hitl' then 'hitl' else 'agent' end,
            coalesce(nullif(v_step.title, ''), nullif(v_step.task, ''), 'Step ' || v_step.ord),
            p_actor, v_wf.workstream_code);
  end loop;

  return v_run_id;
end;
$$ language plpgsql;

-- ── backfill ──────────────────────────────────────────────────────────────────────────────────
-- Every row already sitting there with no workstream, from every engagement — not scoped to one,
-- since the defect was never scoped to one. Joined through the run to the workflow it belongs to,
-- which is the same source `open_workflow_run` reads from now.
update work_task t
   set workstream_code = w.workstream_code
  from workflow_run r
  join workflow w on w.id = r.workflow_id
 where t.workflow_run_id = r.id
   and t.workstream_code is null
   and w.workstream_code is not null;

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
declare v_still_null int;
begin
  if not exists (
    select 1 from pg_proc p
    join pg_language l on l.oid = p.prolang
    where p.proname = 'open_workflow_run' and l.lanname = 'plpgsql'
  ) then
    raise exception 'open_workflow_run is missing';
  end if;

  -- Only rows whose run's workflow itself carries no workstream (there should be none — the
  -- column is `not null` on `workflow`) are allowed to remain unset after the backfill.
  select count(*) into v_still_null
    from work_task t
    join workflow_run r on r.id = t.workflow_run_id
    join workflow w on w.id = r.workflow_id
   where t.workstream_code is null and w.workstream_code is not null;
  if v_still_null > 0 then
    raise exception 'backfill left % task(s) with no workstream_code, though their workflow has one', v_still_null;
  end if;
end $$;
