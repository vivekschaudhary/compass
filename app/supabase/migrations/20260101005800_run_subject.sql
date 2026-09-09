-- 058_run_subject.sql — a run may be ABOUT something, and a nesting row may open more than one.
--
-- `open_nested_run` is idempotent on `parent_task_id` alone, so one nesting row opens exactly one
-- child run, forever. That was right while every nested workflow produced one deliverable for the
-- whole engagement: `sprint-0.draft-features` opens one `feature` run and every feature lands in
-- one `features` document.
--
-- Epic technical design is the first row where that shape is wrong. A design is authored PER EPIC,
-- as its own page, reviewed and approved on its own — so `epics.design-epics-tech` must open one
-- `tech-design` run per approved epic, and those runs differ only in which epic they are about.
-- There was nowhere to put that.
--
-- SUBJECT, NOT EPIC_ID. The column is a text ref rather than a foreign key to `backlog_item`
-- because the same hole is about to be filled again by `build`, whose subject is a story, and by
-- anything else that goes per-item. A run is about a THING the tracker names; which table that
-- thing lives in is the caller's business, not this column's.
--
-- TWO COLUMNS, because a backlog item has two names and they arrive at different times.
-- `subject_ref` is the agent's own handle (`E1`) and exists the moment the epic is drafted;
-- `subject_key` is the Jira key (`KAN-12`) and is null until Jira accepts the issue — the same
-- ordering `backlog_item.ticket_key` already follows. The ref is what identity is keyed on, so a
-- run opened before the mirror is still the same run after it.

alter table workflow_run add column if not exists subject_ref text;
alter table workflow_run add column if not exists subject_key text;

comment on column workflow_run.subject_ref is
  'What this run is ABOUT — a backlog_item.ref (the agent''s handle, e.g. ''E1''), when the run was '
  'opened per-item. Null for a run that covers its whole engagement, which is every run before '
  'epic technical design. Together with parent_task_id this is what makes a nesting row able to '
  'open more than one child.';
comment on column workflow_run.subject_key is
  'The tracker''s name for the subject (e.g. ''KAN-12''), filled once the issue exists. Null until '
  'then — never guessed, for the same reason backlog_item.ticket_key is not written optimistically.';

-- One open run per (row, subject). Without this the idempotency below is a promise with nothing
-- keeping it: two concurrent opens for the same epic both see no existing run and both insert.
-- Partial, because a CLOSED run must not block re-opening the same subject.
create unique index if not exists workflow_run_one_open_per_subject
  on workflow_run (parent_task_id, subject_ref)
  where parent_task_id is not null and subject_ref is not null and state = 'open';

-- ── open_nested_run gains a subject ──────────────────────────────────────────────────────────

-- DROPPED, NOT REPLACED. `create or replace` with a new defaulted argument does not replace the
-- 3-argument function — it creates a second one, and every existing 3-argument call then matches
-- both and fails as ambiguous. The old signature has to go first.
drop function if exists open_nested_run(uuid, text, text);

create or replace function open_nested_run(
  p_task_id uuid, p_actor text, p_actor_role text default null, p_subject_ref text default null
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

  -- Idempotent, now PER SUBJECT. A second click, a retry, a replayed event: none of them should
  -- produce a second copy of the same work — but a different epic is not the same work.
  --
  -- `is not distinct from` rather than `=`: a null subject must match the existing null-subject
  -- run, and `null = null` is null, which would fall through and open a duplicate on every single
  -- retry of every nesting row that has no subject — i.e. all of them today.
  select id into v_existing from workflow_run
   where parent_task_id = p_task_id and state = 'open'
     and subject_ref is not distinct from p_subject_ref;
  if v_existing is not null then
    return v_existing;
  end if;

  v_run_id := open_workflow_run(v_task.org_id, v_task.engagement_id, v_step.nests_workflow_code,
                                p_actor, p_actor_role);
  update workflow_run set parent_task_id = p_task_id, subject_ref = p_subject_ref
   where id = v_run_id;

  return v_run_id;
end;
$$ language plpgsql;

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
--
-- Not decoration. A migration in this repo has reported "Finished" and changed nothing, because an
-- `if not exists` guard found a same-named object from an earlier migration and skipped. Each of
-- these fails loudly if the thing above it did not actually happen.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'workflow_run' and column_name = 'subject_ref') then
    raise exception '058 did not add workflow_run.subject_ref';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'workflow_run' and column_name = 'subject_key') then
    raise exception '058 did not add workflow_run.subject_key';
  end if;
  if not exists (select 1 from pg_indexes
                  where indexname = 'workflow_run_one_open_per_subject') then
    raise exception '058 did not create workflow_run_one_open_per_subject';
  end if;
  -- The point of the whole migration: the 4-argument form exists and the 3-argument one is gone.
  if not exists (select 1 from pg_proc where proname = 'open_nested_run' and pronargs = 4) then
    raise exception '058 did not install the 4-argument open_nested_run';
  end if;
  if exists (select 1 from pg_proc where proname = 'open_nested_run' and pronargs = 3) then
    raise exception '058 left the 3-argument open_nested_run in place — calls will be ambiguous';
  end if;
end $$;
