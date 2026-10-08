-- `output: scaffold` joins the closed set — a row whose deliverable is a set of files written into a
-- repo, opened as a pull request, by the APP.
--
-- `code` hands a story to the v1 orchestrator, which needs a local checkout on the machine that runs
-- it. A scaffold is greenfield and small, and the app can write it through the GitHub API without a
-- checkout at all: the agent returns `{ path, content }` files through its own tool, and the app
-- creates the branch, commits them and opens the pull request. That is why it is a separate value
-- and not `code`: `code` still means "the orchestrator builds this", and a scaffold must not be
-- routed there or depend on a Python process being reachable.
--
-- THE OTHER CLOSED LIST. 060 and 066 recorded the lesson: `STEP_OUTPUTS` in plan.ts is a second
-- vocabulary for this column, and widening only one of them made the dry run green and the apply a
-- 500 after the new version was already published. Both moved in the same commit as this file.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_output_known') then
    raise exception 'expected workflow_step_output_known to exist (057 creates it, 060 and 066 widened it)';
  end if;
end $$;

-- Dropped and recreated, never guarded by `if not exists`: a named constraint that must CHANGE and
-- is skipped because something of the same name exists is a migration that reports "Finished" and
-- did nothing.
alter table workflow_step drop constraint workflow_step_output_known;
alter table workflow_step add constraint workflow_step_output_known
  check (output is null or output in ('roster', 'backlog', 'sprint', 'code', 'supplied', 'scaffold'));

comment on column workflow_step.output is
  'What kind of thing this step produces, from a closed set the app implements: roster (the '
  'approved table becomes member rows), backlog (the agent gets the backlog tool; approval creates '
  'the issues), sprint (the sprint tool; approval labels the committed stories), code (the code '
  'tool; the orchestrator builds the branch and opens the pull request), supplied (the deliverable '
  'is GIVEN by a person — the agent gets `ask` only, never `draft`, and what it is handed is filed '
  'verbatim), scaffold (the scaffold tool; the app commits the returned files to a branch of the '
  'run''s repo through the GitHub API and opens the pull request). NULL — the common case — is an '
  'ordinary authored document. Keyed on instead of `produces`, because `produces` is a path the '
  'user may rename and a rename must not silently disable behaviour.';

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'workflow_step_output_known'
       and pg_get_constraintdef(oid) like '%''scaffold''%'
       and pg_get_constraintdef(oid) like '%''supplied''%') then
    raise exception 'did not widen workflow_step_output_known to accept ''scaffold'' while keeping ''supplied''';
  end if;
end $$;
