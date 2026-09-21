-- `output: supplied` joins the closed set — a row that RECEIVES its deliverable rather than writing it.
--
-- `file-sow` and `file-requirements` exist to take a document from a person and file it verbatim.
-- Nothing in the model let them say so, and it failed twice on a live engagement:
--
--   * `file-requirements` inherited `reads: sow` from its dependency, had material, and DRAFTED
--     eight sections of engagement configuration instead of asking for the client's requirements.
--   * With the dependency removed it asked — but every question came back with `files_to = null`,
--     so nothing would be filed as a document and the next turn would draft from the answers.
--
-- `file-sow` only worked by luck: it had nothing to read, so the model chose to ask AND chose to
-- set `files_to`. That is a model's judgement, not a row's instruction, and the identical row one
-- ord later jumped the other way. A process whose behaviour depends on which way a model jumps is
-- not a process.
--
-- WHAT THE VALUE BUYS. `toolsFor` maps `supplied` to `ask` alone, so `draft` is never offered and
-- the agent CANNOT author the deliverable — there is no tool. That is the whole fix; everything
-- else (the app choosing `files_to`, refusing an ask that files nothing) only makes the remaining
-- path deterministic. It is also what lets `file-requirements` keep reading the SOW so it can
-- report how the two agree, without being able to write the deliverable from it.
--
-- NOT `kind: machine`, which was considered. A machine row is one NOBODY acts on — its evidence is
-- a probe, `initiatePhase` auto-closes it, and `StartButton` offers only "Re-check". An intake row
-- marked machine would have no way to supply anything and would sit idle for ever.
--
-- THE OTHER CLOSED LIST. 060 recorded the lesson this migration has to obey: `STEP_OUTPUTS` in
-- plan.ts is a SECOND vocabulary for this column. When `code` was added to only one of them the
-- dry run was green and the apply was a 500 — after `applyPlan` had already published the new
-- version, leaving a workflow with zero steps. Both lists move in the same commit.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_output_known') then
    raise exception 'expected workflow_step_output_known to exist (057 creates it, 060 widened it)';
  end if;
end $$;

-- Dropped and recreated, never guarded by `if not exists`. A named constraint that must CHANGE and
-- is skipped because something of the same name exists is a migration that reports "Finished" and
-- did nothing.
alter table workflow_step drop constraint workflow_step_output_known;
alter table workflow_step add constraint workflow_step_output_known
  check (output is null or output in ('roster', 'backlog', 'sprint', 'code', 'supplied'));

comment on column workflow_step.output is
  'What kind of thing this step produces, from a closed set the app implements: roster (the '
  'approved table becomes member rows), backlog (the agent gets the backlog tool; approval creates '
  'the issues), sprint (the sprint tool; approval labels the committed stories), code (the code '
  'tool; the orchestrator builds the branch and opens the pull request), supplied (the deliverable '
  'is GIVEN by a person — the agent gets `ask` only, never `draft`, and what it is handed is filed '
  'verbatim). NULL — the common case — is an ordinary authored document. Keyed on instead of '
  '`produces`, because `produces` is a path the user may rename and a rename must not silently '
  'disable behaviour.';

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
--
-- Asserting the NEW value is accepted, not merely that a constraint by that name exists — a check
-- that only looked for the name would pass against 060's version and this migration would be
-- decorative.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'workflow_step_output_known'
       and pg_get_constraintdef(oid) like '%''supplied''%') then
    raise exception 'did not widen workflow_step_output_known to accept ''supplied''';
  end if;
end $$;
