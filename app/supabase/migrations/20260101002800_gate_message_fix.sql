-- 028_gate_message_fix.sql — tell "not checked" and "not met" apart.
--
-- 027 joined measurements with `and m.satisfied` in the ON clause, so a criterion that WAS checked
-- and failed produced no matching row and got reported as "(not checked)". The gate still refused,
-- correctly — but it lied about why, and the two states are the whole reason this design has three
-- of them rather than two.
--
-- Wrong: "connector tickets (not checked)"  — implies nothing looked
-- Right: "connector tickets (not met): No tracker project is configured for this engagement."
--
-- The fix is to join on the criterion alone and decide the label from what came back. Worth the
-- second migration: a gate whose refusal misdescribes itself sends someone to fix the wrong thing.

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
       and (c.step_ord is null or c.step_ord = v_step_ord)
       and (m.id is null or not m.satisfied);

    if v_blocked is not null then
      raise exception E'Not ready:\n  %', v_blocked
        using hint = 'Every Ready criterion must be checked AND satisfied. "Not checked" means nothing could evaluate it yet, which is not the same as failing.';
    end if;
  end if;

  update work_task
     set state = 'running', started_at = now(), started_by = p_actor
   where id = p_task_id;
end;
$$ language plpgsql;
