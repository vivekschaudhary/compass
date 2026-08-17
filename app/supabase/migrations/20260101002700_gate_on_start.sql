-- 027_gate_on_start.sql — a task cannot start until its Ready gate has actually been checked.
--
-- The split this enforces: the APP knows how to evaluate a criterion (it can read documents, check
-- connectors, and later ask Jira and GitHub). The DATABASE enforces that it was done. Neither half
-- can be skipped — you cannot start without measurements, and measurements only come from
-- evaluation.
--
-- The important case is the one in the middle. A criterion nobody could evaluate yet writes NO
-- measurement, and no measurement blocks the start. That is deliberate: "we could not check"
-- must not read the same as "we checked and it passed". Being unable to start because the tracker
-- is not wired is a true and useful state; starting anyway because nothing said otherwise is the
-- false green this whole model exists to prevent.

create or replace function start_task(
  p_task_id uuid, p_actor text, p_actor_role text default null
) returns void as $$
declare
  v_state    text;
  v_step_ord int;
  v_version  uuid;
  v_blocked  text;
begin
  perform compass_set_actor(p_actor, p_actor_role, 'human');

  select t.state, s.ord, r.workflow_version_id
    into v_state, v_step_ord, v_version
    from work_task t
    left join workflow_step s on s.id = t.workflow_step_id
    left join workflow_run  r on r.id = t.workflow_run_id
   where t.id = p_task_id
   for update of t;

  if not found then
    raise exception 'No such task %', p_task_id;
  end if;
  if v_state <> 'idle' then
    -- Refuse rather than silently no-op: a second click that quietly does nothing looks identical
    -- to a first click that worked.
    raise exception 'Task % is already %, not idle. Nothing to start.', p_task_id, v_state;
  end if;

  -- Ad-hoc work has no workflow and therefore no gate. It is unplanned by definition; requiring a
  -- Ready gate would mean nobody could ever record the thing the process failed to anticipate.
  if v_version is not null then
    select string_agg(
             coalesce(nullif(c.statement, ''), c.subject_kind || ' ' || c.subject_ref)
             || case when m.id is null then ' (not checked)' else ' (not met)' end,
             '; ' order by c.ord)
      into v_blocked
      from criterion c
      left join measurement m
        on m.criterion_id = c.id and m.task_id = p_task_id and m.satisfied
     where c.workflow_version_id = v_version
       and c.kind = 'ready'
       and (c.step_ord is null or c.step_ord = v_step_ord)
       and m.id is null;

    if v_blocked is not null then
      raise exception 'Not ready: %', v_blocked
        using hint = 'Every Ready criterion must be checked and satisfied first. "Not checked" means nothing could evaluate it yet — which is not the same as passing.';
    end if;
  end if;

  update work_task
     set state = 'running', started_at = now(), started_by = p_actor
   where id = p_task_id;
end;
$$ language plpgsql;
