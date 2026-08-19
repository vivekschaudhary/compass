-- Workflows nest.
--
-- A phase is a list of rows, and a row is a unit of work. How it gets done varies: some rows are one
-- agent task, some are a whole workflow with its own steps and gates, and some dispatch nothing at
-- all because something else satisfies them. Until now the schema could only express the first,
-- so anything bigger than a single task had to BE a workflow — which is how "shape the kickoff
-- backlog" and "staff the engagement" became two top-level workflows, and how one engagement ended
-- up with nine peer runs holding six tasks between them.
--
-- After this, `basecamp` is one run with three tasks, and a task whose row nests a workflow opens a
-- CHILD run that reports back to it.
--
-- Three pieces, and no more:
--   1. a step may name a workflow instead of a task
--   2. a run may have a parent task
--   3. when a child run closes, its parent task closes with it

-- ── 1. a step may nest ───────────────────────────────────────────────────────────────────────

alter table workflow_step add column if not exists nests_workflow_code text;

-- `kind` gains 'workflow'. The existing constraint lives on work_task, not workflow_step, so this
-- is the first time step kinds are constrained at all — worth doing now, while there are 59 rows
-- and every one of them is known.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_kind_known') then
    alter table workflow_step add constraint workflow_step_kind_known
      check (kind in ('agent','hitl','code','workflow','gate'));
  end if;
end $$;

-- A nesting step names what it nests; a non-nesting step must not. Without this a row could claim
-- `kind = 'workflow'` and nest nothing, which would open a task nobody and nothing can advance —
-- the exact failure that produced three empty runs.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_nests_iff_workflow') then
    alter table workflow_step add constraint workflow_step_nests_iff_workflow
      check ((kind = 'workflow') = (nests_workflow_code is not null));
  end if;
end $$;

-- ── 2. a run may have a parent ───────────────────────────────────────────────────────────────

alter table workflow_run add column if not exists parent_task_id uuid references work_task(id) on delete cascade;

create index if not exists workflow_run_parent on workflow_run(parent_task_id) where parent_task_id is not null;

comment on column workflow_run.parent_task_id is
  'The task this run was opened to satisfy, when the task''s step nests a workflow. Null for a run '
  'the delivery manager initiated directly. Cascade: a deleted task takes its child run with it — '
  'the child exists only to satisfy the parent.';

-- ── 3. a child closing closes its parent ─────────────────────────────────────────────────────

create or replace function close_parent_task_when_child_run_closes() returns trigger as $$
declare
  v_parent work_task%rowtype;
begin
  if new.state <> 'closed' or old.state = 'closed' or new.parent_task_id is null then
    return new;
  end if;

  select * into v_parent from work_task where id = new.parent_task_id;
  if not found or v_parent.state = 'closed' then
    return new;
  end if;

  -- The child run's own gates are what was actually checked; the parent task's gate is the row's,
  -- and it is measured the same way as any other. So this does NOT bypass close_task — it calls it.
  --
  -- The exception block is load-bearing. close_task RAISES when a Done criterion is unsatisfied,
  -- and an exception in an AFTER trigger aborts the whole transaction — which would roll back the
  -- CHILD's close as well, so finishing nested work would appear to do nothing at all. Catching it
  -- leaves the honest state: the child is closed, the parent is open, and the log says why.
  begin
    perform close_task(new.parent_task_id, coalesce(new.opened_by, 'system'), v_parent.role_code);

    insert into event (org_id, engagement_id, actor_kind, actor_role_code, actor_user_id,
                       subject_type, subject_id, verb, payload)
    values (new.org_id, new.engagement_id, 'system', v_parent.role_code, null,
            'task', v_parent.id, 'task.satisfied_by_child_run',
            jsonb_build_object('run', new.id, 'task', v_parent.id));
  exception when others then
    insert into event (org_id, engagement_id, actor_kind, actor_role_code, actor_user_id,
                       subject_type, subject_id, verb, payload)
    values (new.org_id, new.engagement_id, 'system', v_parent.role_code, null,
            'task', v_parent.id, 'task.child_run_closed_gate_not_met',
            jsonb_build_object('run', new.id, 'task', v_parent.id, 'reason', sqlerrm));
  end;

  return new;
end;
$$ language plpgsql;

drop trigger if exists child_run_closes_parent on workflow_run;
create trigger child_run_closes_parent after update on workflow_run
  for each row execute function close_parent_task_when_child_run_closes();

-- ── opening a nested run ─────────────────────────────────────────────────────────────────────

-- The front door for a task whose step nests a workflow. Deliberately separate from
-- open_workflow_run rather than an extra argument on it: that one opens a run because a person
-- decided to, this one opens a run because a row demands it, and the two refusals differ.
create or replace function open_nested_run(
  p_task_id uuid, p_actor text, p_actor_role text default null
) returns uuid as $$
declare
  v_task   work_task%rowtype;
  v_step   workflow_step%rowtype;
  v_run_id uuid;
  v_existing uuid;
begin
  select * into v_task from work_task where id = p_task_id;
  if not found then
    raise exception 'No such task %', p_task_id;
  end if;

  select * into v_step from workflow_step where id = v_task.workflow_step_id;
  if not found or v_step.nests_workflow_code is null then
    raise exception 'Task % does not nest a workflow — there is nothing to open.', p_task_id;
  end if;

  -- Idempotent. A second click, a retry, a replayed event: none of them should produce a second
  -- copy of the same work.
  select id into v_existing from workflow_run where parent_task_id = p_task_id and state = 'open';
  if v_existing is not null then
    return v_existing;
  end if;

  v_run_id := open_workflow_run(v_task.org_id, v_task.engagement_id, v_step.nests_workflow_code,
                                p_actor, p_actor_role);
  update workflow_run set parent_task_id = p_task_id where id = v_run_id;

  return v_run_id;
end;
$$ language plpgsql;
