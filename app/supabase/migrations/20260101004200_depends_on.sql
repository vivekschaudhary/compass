-- 042_depends_on.sql — a row cannot start before the rows it depends on have closed.
--
-- The phases declare dependencies (`pre-sprint-0` row 5 depends on row 4: you cannot write a RACI
-- against a roster nobody has agreed). Until now that was documentation. `open_phase_run` creates
-- every row at once — deliberately, so a delivery manager sees the whole phase — which means every
-- row is startable on day one and the order lives only in the reader's head.
--
-- REFERENCED BY TASK SLUG, NOT BY ORD. A delivery manager reordering rows while reviewing the plan
-- must not silently re-point every edge, and `depends_on: draft-epics` reads as intent where
-- `depends_on: 2` reads as arithmetic — which matters when a human is checking an agent's draft.
--
-- BACKWARD-ONLY, ENFORCED. Every named slug must belong to a row ABOVE this one. In an ordered list
-- a forward dependency was always a contradiction, and the constraint means a CYCLE CANNOT BE
-- WRITTEN DOWN: no cycle detection anywhere, and a valid topological order for free. That matters
-- more because an agent drafts the plan — it cannot produce an invalid one in this dimension.

alter table workflow_step add column if not exists depends_on text[] not null default '{}';

-- Every slug names a row above this one, in the same version. A trigger rather than a check
-- constraint because it is a statement about OTHER rows in the table.
--
-- DEFERRED, and that is not a detail. The importer writes a version's steps in ONE multi-row insert,
-- and a BEFORE ROW trigger cannot see rows inserted earlier in the same statement — they share a
-- command id and are outside the trigger's snapshot. A plain trigger would therefore reject every
-- dependency the importer writes, always, while looking like a correct rule. A DEFERRABLE INITIALLY
-- DEFERRED constraint trigger fires at COMMIT, when the whole version is visible.
create or replace function workflow_step_depends_backward() returns trigger as $$
declare
  v_slug text;
  v_ord  int;
begin
  foreach v_slug in array new.depends_on loop
    select ord into v_ord
      from workflow_step
     where workflow_version_id = new.workflow_version_id and task = v_slug;

    if v_ord is null then
      raise exception 'step %.% depends on ''%'', which is not a row in this workflow',
        new.ord, coalesce(new.task, '?'), v_slug;
    end if;
    if v_ord >= new.ord then
      raise exception 'step %.% depends on ''%'' at ord % — dependencies point backwards, so a cycle cannot be written',
        new.ord, coalesce(new.task, '?'), v_slug, v_ord;
    end if;
  end loop;
  return new;
end;
$$ language plpgsql;

drop trigger if exists workflow_step_depends_backward on workflow_step;
create constraint trigger workflow_step_depends_backward
  after insert or update on workflow_step
  deferrable initially deferred
  for each row when (array_length(new.depends_on, 1) is not null)
  execute function workflow_step_depends_backward();

-- The migration asserts its own effect. A named object that must EXIST after this runs is checked
-- here rather than trusted: this repo has had a migration report "Finished" and change nothing,
-- because an `if not exists` found a same-named object from an older migration and skipped.
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'workflow_step_depends_backward'
       and tgrelid = 'workflow_step'::regclass
       and tgdeferrable
  ) then
    raise exception 'workflow_step_depends_backward is missing or not deferrable — the rule is not in force';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'workflow_step' and column_name = 'depends_on'
  ) then
    raise exception 'workflow_step.depends_on was not created';
  end if;
end $$;

-- ── start_task now refuses a row whose dependencies are still open ──────────────────────────
--
-- Named, not counted: "waiting on Staffing plan and resources" tells someone what to go and do.
-- "2 dependencies unmet" tells them to go and look.
create or replace function start_task(
  p_task_id uuid, p_actor text, p_actor_role text default null
) returns void as $$
declare
  v_state    text;
  v_step_ord int;
  v_version  uuid;
  v_run      uuid;
  v_blocked  text;
  v_waiting  text;
begin
  perform compass_set_actor(p_actor, p_actor_role, 'human');

  select t.state, s.ord, r.workflow_version_id, t.workflow_run_id
    into v_state, v_step_ord, v_version, v_run
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
       and s.ord = v_step_ord
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
