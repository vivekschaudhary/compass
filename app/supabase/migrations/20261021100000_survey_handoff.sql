-- survey_handoff.sql — a step may declare `output: survey`, and a handoff may be a survey.
--
-- A technical design has to name real modules, and the app's agent has no tool that opens a file.
-- A survey row hands the reading to the Python orchestrator the way a scaffold row hands over the
-- generator: the agent says what it needs to know, `handoff survey` reads the checkout read-only
-- and returns cited findings, and the result is recorded on a `handoff_call` the gate reads.
--
-- Three closed sets widen, each dropped and recreated, never guarded by `if not exists`: a named
-- constraint that must CHANGE and is skipped because something of that name exists is a migration
-- that reports "Finished" and did nothing.
--   workflow_step_output_known  + 'survey'
--   handoff_call_kind_known     + 'survey'
--   handoff_call_status_known   + 'surveyed', 'survey_failed'   ('refused' already covers a refusal)

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_output_known') then
    raise exception 'expected workflow_step_output_known to exist';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'handoff_call_kind_known') then
    raise exception 'expected handoff_call_kind_known to exist';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'handoff_call_status_known') then
    raise exception 'expected handoff_call_status_known to exist';
  end if;
end $$;

alter table workflow_step drop constraint workflow_step_output_known;
alter table workflow_step add constraint workflow_step_output_known
  check (output is null or output in (
    'roster', 'backlog', 'stories', 'sprint', 'code', 'supplied', 'scaffold', 'scaffold-plan', 'survey'
  ));

alter table handoff_call drop constraint handoff_call_kind_known;
alter table handoff_call add constraint handoff_call_kind_known
  check (kind in ('generate', 'survey'));

alter table handoff_call drop constraint handoff_call_status_known;
alter table handoff_call add constraint handoff_call_status_known check (
  status in ('running', 'shipped', 'checks_failed', 'generator_failed', 'refused', 'surveyed', 'survey_failed')
);

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
declare
  o text; k text; s text;
begin
  select pg_get_constraintdef(oid) into o from pg_constraint where conname = 'workflow_step_output_known';
  select pg_get_constraintdef(oid) into k from pg_constraint where conname = 'handoff_call_kind_known';
  select pg_get_constraintdef(oid) into s from pg_constraint where conname = 'handoff_call_status_known';

  if o not like '%''survey''%' then raise exception 'workflow_step_output_known does not accept survey'; end if;
  if k not like '%''survey''%' then raise exception 'handoff_call_kind_known does not accept survey'; end if;
  if s not like '%''surveyed''%' or s not like '%''survey_failed''%' then
    raise exception 'handoff_call_status_known does not accept the survey statuses';
  end if;

  -- Widened, not replaced: every value each set accepted before must still be accepted.
  if o not like '%''roster''%' or o not like '%''backlog''%' or o not like '%''stories''%'
     or o not like '%''sprint''%' or o not like '%''code''%' or o not like '%''supplied''%'
     or o not like '%''scaffold''%' or o not like '%''scaffold-plan''%' then
    raise exception 'workflow_step_output_known lost a value it accepted before';
  end if;
  if k not like '%''generate''%' then raise exception 'handoff_call_kind_known lost generate'; end if;
  if s not like '%''running''%' or s not like '%''shipped''%' or s not like '%''checks_failed''%'
     or s not like '%''generator_failed''%' or s not like '%''refused''%' then
    raise exception 'handoff_call_status_known lost a value it accepted before';
  end if;
end $$;
