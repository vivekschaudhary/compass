-- 031_close_task.sql — a task cannot close until its Done criteria are satisfied.
--
-- The mirror of 027/028. Same split, same three states: the app knows how to evaluate a criterion,
-- the database enforces that it was done, and a criterion nobody could evaluate blocks rather than
-- passes.
--
-- WHAT IS DIFFERENT HERE: most Done criteria are judgment. "Scope not covered by any row is named
-- rather than left implicit" cannot be computed — it needs someone who knows the engagement to
-- read the draft and say so. That person is the evaluator, and their attestation is recorded as a
-- measurement with `source = 'human'` and their name on it, exactly like a machine check.
--
-- Which is why approving is per-criterion rather than one button. A single "Approve" that silently
-- satisfies five criteria is a signature on work nobody read — the precise thing a HITL gate exists
-- to prevent. Five ticks, five measurements, one name against each.

-- work_task records who started it but not who closed it. An approval with no name on it is the
-- kind of record that looks complete and answers nothing when someone asks who signed off.
alter table work_task add column if not exists closed_by text;

create or replace function close_task(
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
       and (c.step_ord is null or c.step_ord = v_step_ord)
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
  -- and reimplementing that here would create a second answer to the same question — which is the
  -- objection that got document_permission dropped one migration ago. One mechanism, in one place.
end;
$$ language plpgsql;
