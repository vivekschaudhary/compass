-- 060_step_output_code.sql — `output: code` joins the closed set.
--
-- 057 opened this column with three values and said what adding a fourth costs: "Adding a fifth
-- value is a migration AND code, which is correct — a value the app has no behaviour for would be a
-- row that declares something nothing does." The behaviour now exists: `TOOL_FOR.code` gives a step
-- the `code` tool, which hands the story to the orchestrator, which creates the branch, runs the
-- project's CI-parity checks and opens a pull request only on green.
--
-- THE APP-SIDE LIST WAS NOT ENOUGH, and that is the lesson worth keeping. `STEP_OUTPUTS` in
-- plan.ts already accepted `code`, so the import PLANNED cleanly and reported "5 steps added" —
-- and then the insert hit this constraint. Two closed vocabularies for one column, and only one of
-- them was updated: the dry run was green and the apply was a 500.
--
-- It left `build` with a PUBLISHED version carrying ZERO STEPS. `applyPlan` publishes the new
-- version and supersedes the old one before inserting steps, and it is not transactional, so a
-- rejected insert strands a workflow that would open a run and create no tasks. The constraint did
-- its job; the importer's ordering is a separate defect and is not fixed here.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_output_known') then
    raise exception '060 expected workflow_step_output_known to exist (057 creates it)';
  end if;
end $$;

-- DROPPED AND RECREATED, never guarded by `if not exists`. A named constraint that must CHANGE is
-- exactly the case this repo has already been bitten by: an `if not exists (conname = …)` guard
-- found the same-named constraint from an earlier migration, skipped, and the migration reported
-- "Finished" having changed nothing.
alter table workflow_step drop constraint workflow_step_output_known;
alter table workflow_step add constraint workflow_step_output_known
  check (output is null or output in ('roster', 'backlog', 'sprint', 'code'));

comment on column workflow_step.output is
  'What kind of thing this step produces, from a closed set the app implements: roster (the '
  'approved table becomes member rows), backlog (the agent gets the backlog tool; approval creates '
  'the issues), sprint (the sprint tool; approval labels the committed stories), code (the code '
  'tool; the orchestrator builds the branch and opens the pull request). NULL — the common case — '
  'is an ordinary document. Keyed on instead of `produces`, because `produces` is a path the user '
  'may rename and a rename must not silently disable behaviour.';

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
--
-- Asserting the NEW value is accepted, not merely that a constraint by that name exists — which is
-- what the drop-and-recreate above is for. A check that only looked for the name would pass against
-- 057's version and this migration would be decorative.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'workflow_step_output_known'
       and pg_get_constraintdef(oid) like '%''code''%') then
    raise exception '060 did not widen workflow_step_output_known to accept ''code''';
  end if;
end $$;
