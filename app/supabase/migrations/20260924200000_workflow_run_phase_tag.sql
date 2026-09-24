-- workflow_run_phase_tag.sql — which reporting bucket a sprint run belongs to.
--
-- `sprint` repeats — the same workflow_code across every sprint of an engagement — so nothing on
-- the run itself says whether THIS one is early feature-building work, post-launch stabilization,
-- or long-tail support. `setup` and `discovery` (sprint-0) don't need this: their workflow_code
-- alone already says which phase they are.
--
-- FREE TEXT, NOT AN ENUM. discovery/setup/build/hypercare/support are today's starting vocabulary,
-- not a fixed one — the configurable list is reference data for the admin client, future work and
-- not this migration's job. This is a reporting label for status/dashboard rollups, not something
-- the engine gates or branches on — same reasoning `subject_ref` was kept free text for
-- (058_run_subject.sql / 20260101005800_run_subject.sql).
--
-- No backfill: no sprint has been run on any engagement yet, so there is nothing to tag.

alter table workflow_run add column if not exists phase_tag text;

comment on column workflow_run.phase_tag is
  'Which reporting bucket this run belongs to (discovery, build, hypercare, support, ...) — a '
  'label for status/dashboard rollups, not something the engine gates on. Null means not yet '
  'classified. Free text: the configurable vocabulary is admin-client reference data, not '
  'enforced here.';

-- The migration asserts its own effect — a repo lesson, not decoration: a migration here has
-- reported "Finished" and changed nothing before, because an `if not exists` guard found a
-- same-named object from an earlier migration and skipped.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'workflow_run' and column_name = 'phase_tag'
  ) then
    raise exception 'workflow_run.phase_tag was not created';
  end if;
end $$;
