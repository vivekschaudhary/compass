-- step_output_design.sql — a step may declare `output: design`.
--
-- An epic's technical design has to name real modules, and the app's agent has no tool that opens a
-- file. A `design` row hands the whole step to the Python orchestrator, as a `code` row does for a
-- build: the staff engineer runs there with its read-only `executor_tools` inside the repo checkout,
-- and the design comes back to the app, which files it as a document in the database. Like `code`,
-- the output is what gives the step its hand-off, so it is a value in the closed set
-- `workflow_step_output_known` enforces (057 created it; 060, 066, 20260928, 20261005 and
-- 20261020100100 each widened it).
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
    'roster', 'backlog', 'stories', 'sprint', 'code', 'supplied', 'scaffold', 'scaffold-plan', 'design'
  ));

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
declare
  o text;
begin
  select pg_get_constraintdef(oid) into o from pg_constraint where conname = 'workflow_step_output_known';
  if o not like '%''design''%' then
    raise exception 'workflow_step_output_known does not accept design';
  end if;
  -- Widened, not replaced: every value it accepted before must still be accepted.
  if o not like '%''roster''%' or o not like '%''backlog''%' or o not like '%''stories''%'
     or o not like '%''sprint''%' or o not like '%''code''%' or o not like '%''supplied''%'
     or o not like '%''scaffold''%' or o not like '%''scaffold-plan''%' then
    raise exception 'workflow_step_output_known lost a value it accepted before';
  end if;
end $$;
