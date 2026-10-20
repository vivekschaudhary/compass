-- step_output_stories.sql — a step may declare `output: stories`.
--
-- `refine-stories` drafts the stories of ONE epic through its own tool, and approval files them
-- under that epic on the board. Like `backlog`, the output is what gives the step its tool and what
-- the materialiser keys on, so it is a value in the closed set `workflow_step_output_known` enforces
-- (057 created it; 060, 066, 20260928 and 20261005 each widened it).
--
-- Dropped and recreated, never guarded by `if not exists`: a named constraint that must CHANGE and
-- is skipped because something of the same name exists is a migration that reports "Finished" and
-- did nothing.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_output_known') then
    raise exception 'expected workflow_step_output_known to exist';
  end if;
end $$;

alter table workflow_step drop constraint workflow_step_output_known;
alter table workflow_step add constraint workflow_step_output_known
  check (output is null or output in (
    'roster', 'backlog', 'stories', 'sprint', 'code', 'supplied', 'scaffold', 'scaffold-plan'
  ));

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_output_known'
                   and pg_get_constraintdef(oid) like '%''stories''%') then
    raise exception 'workflow_step_output_known does not accept stories';
  end if;
  -- Widened, not replaced: every value it accepted before must still be accepted.
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_output_known'
                   and pg_get_constraintdef(oid) like '%''scaffold-plan''%'
                   and pg_get_constraintdef(oid) like '%''supplied''%'
                   and pg_get_constraintdef(oid) like '%''roster''%'
                   and pg_get_constraintdef(oid) like '%''backlog''%'
                   and pg_get_constraintdef(oid) like '%''sprint''%'
                   and pg_get_constraintdef(oid) like '%''code''%') then
    raise exception 'workflow_step_output_known lost a value it accepted before';
  end if;
end $$;
