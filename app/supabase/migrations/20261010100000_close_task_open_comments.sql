-- close_task_open_comments.sql — a task cannot be approved while the document it gates has an open
-- comment.
--
-- A reviewer's comment is a thing said about the work that nobody has answered. Approving over it
-- records that the work was accepted while a named objection to it stands, which is the exact signature
-- nobody-read-this the per-criterion approval exists to prevent. So the close refuses, in the database,
-- where every path to a closed task has to pass: `close_task` is the only place in this repo's
-- migrations and app source that sets a `work_task` to `closed`, and a button that is merely greyed out
-- is a suggestion.
--
-- WHICH DOCUMENT A TASK GATES, WITHOUT RE-DERIVING ITS PATH. The app resolves a task's document by
-- reading the step's `produces`, filling `{epic}` from the run's subject and stripping `@docs`/
-- `@tickets` — logic that lives in TypeScript, and a second copy here is a second place for it to
-- drift. This avoids it: `file_document` already stamps every version it files with
-- `created_by_task_id`, so the documents a task AUTHORED are the ones its versions say it filed. A
-- review row authors nothing, so it gates the documents its REVIEWED task filed, found by following
-- `depends_on` through steps with no `produces` of their own — the same walk `resolveReviewedTask`
-- does, capped at the same five hops.
--
-- ONLY TOP-LEVEL COMMENTS COUNT, AND ONLY THEIR STATUS. A reply is never resolvable (a check on the
-- table enforces that), and who wrote a comment — a reviewer, the agent — does not matter: the question
-- is whether an open one exists. Comments on EVERY version of the document count, not just the current
-- one: a comment survives the edit it prompted and stays until somebody resolves it.
--
-- `task_open_comments` is a function of its own so the app's early refusal and this gate read the same
-- answer — the app asks BEFORE it moves the ticket on the board, and a refusal that came only from
-- `close_task` would flip Jira to Done and back.
--
-- WHAT THIS CANNOT SEE. If no version names the task (a task that has not filed anything yet) there is
-- no document to look at and the count is zero. That is correct for a task with nothing to comment on,
-- and the one case where "no rows" and "nothing wrong" are the same sentence.

create or replace function task_gated_documents(p_task_id uuid) returns setof uuid
language sql stable as $$
  with recursive me as (
    select t.id as task_id, t.workflow_run_id, s.workflow_version_id, s.renders, s.depends_on
      from work_task t
      left join workflow_step s on s.id = t.workflow_step_id
     where t.id = p_task_id
  ),
  chain(step_id, produces, depends_on, version_id, hop) as (
    select s.id, s.produces, s.depends_on, s.workflow_version_id, 1
      from me
      join workflow_step s
        on s.workflow_version_id = me.workflow_version_id and s.task = me.depends_on[1]
     where me.renders in ('doc-review', 'code-review')
    union all
    select s.id, s.produces, s.depends_on, s.workflow_version_id, c.hop + 1
      from chain c
      join workflow_step s
        on s.workflow_version_id = c.version_id and s.task = c.depends_on[1]
     where coalesce(btrim(c.produces), '') = '' and c.hop < 5
  ),
  reviewed as (
    select step_id from chain where coalesce(btrim(produces), '') <> '' order by hop limit 1
  ),
  tasks as (
    select p_task_id as id
    union
    select wt.id
      from reviewed r
      join me on true
      join work_task wt
        on wt.workflow_step_id = r.step_id and wt.workflow_run_id = me.workflow_run_id
  )
  select distinct dv.document_id
    from document_version dv
    join tasks on dv.created_by_task_id = tasks.id
$$;

create or replace function task_open_comments(p_task_id uuid) returns int
language sql stable as $$
  select count(*)::int
    from document_comment c
    join document_section ds on ds.id = c.document_section_id
    join document_version dv on dv.id = ds.document_version_id
   where c.parent_id is null
     and c.status = 'open'
     and dv.document_id in (select * from task_gated_documents(p_task_id))
$$;

-- Redefined whole, as `create or replace` requires: the live definition is the one in
-- 20260101004600, and the only change is the block marked below.
create or replace function close_task(
  p_task_id uuid, p_actor text, p_actor_role text default null
) returns void as $$
declare
  v_state     text;
  v_step_task text;
  v_version   uuid;
  v_blocked   text;
  v_open      int;
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

  -- NEW: open comments on the document this task gates. Outside the `v_version` block on purpose —
  -- ad-hoc work has no workflow and so no criteria, but a document it filed can still be commented on.
  v_open := task_open_comments(p_task_id);
  if v_open > 0 then
    raise exception E'% open comment(s) on the document must be resolved first.', v_open
      using hint = 'A comment is resolved by answering it, or by a person marking it resolved. Approving over an open comment would record the work as accepted while an objection to it stands.';
  end if;

  update work_task
     set state = 'closed', closed_at = now(), closed_by = p_actor
   where id = p_task_id;

  -- The run closes itself. 024 already has a trigger that closes a run when its last task closes,
  -- and reimplementing that here would create a second answer to the same question. One mechanism,
  -- in one place.
end;
$$ language plpgsql;

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'task_open_comments') then
    raise exception 'task_open_comments was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'task_gated_documents') then
    raise exception 'task_gated_documents was not created';
  end if;
  -- The one that has to CHANGE: the live close_task must now consult the comment count. `create or
  -- replace` succeeding says nothing about which body is installed.
  if pg_get_functiondef('close_task(uuid,text,text)'::regprocedure) not like '%task_open_comments%' then
    raise exception 'close_task does not call task_open_comments — the gate is not installed';
  end if;
end $$;
