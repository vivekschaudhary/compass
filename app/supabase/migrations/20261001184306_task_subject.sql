-- task_subject.sql — a single TASK may be about a subject, not just the run it sits in.
--
-- `workflow_run.subject_ref` (058) is enough while a fan-out's only shape is "one child run per
-- subject" — the run itself IS the subject. `scaffold-repos` breaks that: Jira's own hierarchy caps
-- at Epic -> Sub-task, and `foundation-architecture` already sits one level nested under `sprint-0`,
-- so a second-level nested run per repo cannot be mirrored (`mirrorNested` correctly refuses it as
-- "nested two deep"). The fix is to stop opening a second run at all — materialize the fanned-out
-- step pair (`execute-scaffold`, `approve-repo-scaffold`) as plain tasks INSIDE the parent run, one
-- pair per repo, same run, no second nesting level.
--
-- That puts more than one subject inside a single run for the first time, so the run can no longer
-- answer "what is THIS task about" — each materialized task has to carry its own copy of the same
-- fact `workflow_run.subject_ref` already carries for a whole run. Same idea, one level down.

alter table work_task add column if not exists subject_ref text;

comment on column work_task.subject_ref is
  'What THIS task is about, when more than one subject shares a run (see workflow_run.subject_ref, '
  'which this mirrors one level down). Null for every task before scaffold-repos inline fan-out — '
  'a task in a single-subject run is about whatever its run is about, same as always.';

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'work_task' and column_name = 'subject_ref') then
    raise exception 'task_subject did not add work_task.subject_ref';
  end if;
end $$;
