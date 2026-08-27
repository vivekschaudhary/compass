-- A criterion names the ROW it belongs to, by task slug — not the position that row happens to sit at.
--
-- `step_ord` was an ordinal, and an ordinal is a position. When sprint-0 absorbed pre-sprint-0 the
-- steps were renumbered and criteria.csv was not, so every criterion slid onto a different row:
-- the timeline row asked for the product brief, the staffing row asked for the timeline, and the
-- sprint-plan row checked 03-delivery/plan, which a DIFFERENT row publishes. Seven of twelve rows
-- were wrong and nothing failed, because a permuted ordinal still names a real step.
--
-- `depends_on` already learned this and stores slugs (20260101004200). This is the same lesson
-- applied to the other edge that points at a step.
--
-- Null still means the criterion belongs to the workflow as a whole.

alter table criterion add column step_task text;

-- Backfill through the ordinal BEFORE dropping it, per version. A version's steps are unique on
-- (workflow_version_id, ord), so this join cannot fan out.
update criterion c
   set step_task = s.task
  from workflow_step s
 where s.workflow_version_id = c.workflow_version_id
   and s.ord = c.step_ord;

-- Debris from a retired workflow, deleted rather than carried forward.
--
-- pre-sprint-0 was absorbed into sprint-0. Its four workflow_versions survive with ZERO steps
-- between them and no run referencing any of them, but sixteen criterion rows outlived the steps
-- they named. They cannot be backfilled — there is no row to name — and they cannot be left as
-- nulls, because null MEANS workflow-level: a criterion that could never evaluate would become one
-- that applies to every step of a dead workflow.
--
-- Scoped to versions with no steps AT ALL. That is the provable case: nothing in such a version
-- could ever have been dispatched, so nothing is lost. An orphan in a version that still has steps
-- is a different thing entirely — real drift, with a live graph around it — and the assertion
-- below still halts on it.
delete from criterion c
 where c.step_ord is not null
   and c.step_task is null
   and not exists (select 1 from workflow_step s where s.workflow_version_id = c.workflow_version_id);

-- Assert the effect rather than trusting that the update ran. A step_ord that resolved to nothing
-- would land here as a null, and null is the value that MEANS workflow-level — a broken row would
-- become a plausible one, which is the false green this whole model exists to prevent.
--
-- This fired on the first run against the live database and refused the whole migration, which is
-- how the sixteen above were found. Keep it after the delete, not instead of it.
do $$
declare n int;
begin
  select count(*) into n from criterion where step_ord is not null and step_task is null;
  if n > 0 then
    raise exception 'Backfill incomplete: % criteria have a step_ord naming no step in a version that still has steps', n;
  end if;
end $$;

drop index if exists criterion_by_version;
alter table criterion drop column step_ord;
create index criterion_by_version on criterion (workflow_version_id, kind, step_task);

-- ── the gates ────────────────────────────────────────────────────────────────────────────────
-- Both functions read the criteria that apply to one task. Redefined whole rather than patched:
-- these are `create or replace`, and the live definitions are start_task from 20260101004200 and
-- close_task from 20260101003100.

create or replace function start_task(
  p_task_id uuid, p_actor text, p_actor_role text default null
) returns void as $$
declare
  v_state     text;
  v_step_task text;
  v_version   uuid;
  v_run       uuid;
  v_blocked   text;
  v_waiting   text;
begin
  perform compass_set_actor(p_actor, p_actor_role, 'human');

  select t.state, s.task, r.workflow_version_id, t.workflow_run_id
    into v_state, v_step_task, v_version, v_run
    from work_task t
    left join workflow_step s on s.id = t.workflow_step_id
    left join workflow_run  r on r.id = t.workflow_run_id
   where t.id = p_task_id
   for update of t;

  if not found then
    raise exception 'No such task %', p_task_id;
  end if;
  if v_state <> 'idle' then
    raise exception 'Task % is already %, not idle. Nothing to start.', p_task_id, v_state;
  end if;

  -- Ad-hoc work has no workflow and therefore no gate. It is unplanned by definition; requiring a
  -- Ready gate would mean nobody could ever record the thing the process failed to anticipate.
  if v_version is not null then
    select string_agg(
             coalesce(nullif(c.statement, ''), c.subject_kind || ' ' || c.subject_ref)
             || case
                  when m.id is null then ' (not checked — nothing could evaluate it)'
                  else ' (not met: ' || coalesce(m.detail, 'no detail recorded') || ')'
                end,
             E'\n  ' order by c.ord)
      into v_blocked
      from criterion c
      left join measurement m
        on m.criterion_id = c.id and m.task_id = p_task_id
     where c.workflow_version_id = v_version
       and c.kind = 'ready'
       and (c.step_task is null or c.step_task = v_step_task)
       and (m.id is null or not m.satisfied);

    if v_blocked is not null then
      raise exception E'Not ready:\n  %', v_blocked
        using hint = 'Every Ready criterion must be checked AND satisfied. "Not checked" means nothing could evaluate it yet, which is not the same as failing.';
    end if;

    -- The rows this one depends on, in THIS run, that have not closed. Scoped to the run: a
    -- dependency satisfied on a different engagement's run is not satisfied here.
    select string_agg(dt.title, E'\n  ' order by ds.ord)
      into v_waiting
      from workflow_step s
      join workflow_step ds
        on ds.workflow_version_id = s.workflow_version_id
       and ds.task = any (s.depends_on)
      join work_task dt
        on dt.workflow_step_id = ds.id and dt.workflow_run_id = v_run
     where s.workflow_version_id = v_version
       and s.task = v_step_task
       and dt.state <> 'closed';

    if v_waiting is not null then
      raise exception E'Waiting on:\n  %', v_waiting
        using hint = 'This row declares what it derives from. Close those first, or the draft is built on a basis that does not exist yet.';
    end if;
  end if;

  update work_task
     set state = 'running', started_at = now(), started_by = p_actor
   where id = p_task_id;
end;
$$ language plpgsql;

create or replace function close_task(
  p_task_id uuid, p_actor text, p_actor_role text default null
) returns void as $$
declare
  v_state     text;
  v_step_task text;
  v_version   uuid;
  v_blocked   text;
begin
  perform compass_set_actor(p_actor, p_actor_role, 'human');

  select t.state, s.task, r.workflow_version_id
    into v_state, v_step_task, v_version
    from work_task t
    left join workflow_step s on s.id = t.workflow_step_id
    left join workflow_run  r on r.id = t.workflow_run_id
   where t.id = p_task_id
   for update of t;

  if not found then
    raise exception 'No such task %', p_task_id;
  end if;
  if v_state = 'closed' then
    raise exception 'Task % is already closed.', p_task_id;
  end if;
  if v_state = 'idle' then
    raise exception 'Task % never started. There is nothing to approve.', p_task_id;
  end if;

  if v_version is not null then
    select string_agg(
             coalesce(nullif(c.statement, ''), c.subject_kind || ' ' || c.subject_ref)
             || case
                  when m.id is null then ' (not checked)'
                  else ' (not met: ' || coalesce(m.detail, 'no detail recorded') || ')'
                end,
             E'\n  ' order by c.ord)
      into v_blocked
      from criterion c
      left join measurement m
        on m.criterion_id = c.id and m.task_id = p_task_id
     where c.workflow_version_id = v_version
       and c.kind = 'done'
       and (c.step_task is null or c.step_task = v_step_task)
       and (m.id is null or not m.satisfied);

    if v_blocked is not null then
      raise exception E'Not done:\n  %', v_blocked
        using hint = 'Every Done criterion must be checked AND satisfied. Judgment criteria are satisfied by a person confirming them, which records who confirmed and when.';
    end if;
  end if;

  update work_task
     set state = 'closed', closed_at = now(), closed_by = p_actor
   where id = p_task_id;

  -- The run closes itself. 024 already has a trigger that closes a run when its last task closes,
  -- and reimplementing that here would create a second answer to the same question. One mechanism,
  -- in one place.
end;
$$ language plpgsql;
