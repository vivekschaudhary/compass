-- 057_step_output.sql — a step says what KIND of thing it makes, instead of the app guessing from
-- the document's name.
--
-- THE BUG THIS FIXES IS SILENT, WHICH IS WHY IT MATTERS. Two maps in the app decide what a step
-- does, and both were keyed on the produced PATH:
--
--   tools.ts       PRODUCES_TOOL["02-scope/deliverables"] = "backlog"   → which tool the agent gets
--   materialise.ts REGISTRY["02-scope/deliverables"]      = backlog     → what runs on approval
--
-- `produces` is a value the user writes in a CSV. Renaming `02-scope/deliverables` to `deliverables`
-- — an ordinary tidy-up, no warning anywhere — makes both lookups miss. The step still runs, still
-- files a document, still passes its gates, and silently stops creating the client's Jira issues.
-- The roster stops becoming `member` rows. The sprint plan stops reaching the board. Nothing fails;
-- three of the most consequential rows in sprint-0 just quietly do nothing.
--
-- That is rule 11's shape exactly: not a crash, but a green step indistinguishable from one that
-- worked.
--
-- THE ORIGINAL KEY HAD A REASON, and it is kept. `sprint-0.draft-sprint-plan` and
-- `sprint.sprint-planning` are deliberately the same step written twice, and keying on the path
-- made them the same behaviour by construction — one registration, no second copy to drift. Keying
-- on `output` keeps that: both rows carry `sprint`, and now they say so in the CSV where a reader
-- can see it, rather than relying on two paths staying spelled alike.
--
-- A CLOSED VOCABULARY, NOT FREE TEXT. This is the same shape the schema already uses for
-- `work_task.kind`, `criterion.subject_kind` and the `@docs`/`@tickets` destination slot: a small
-- set the APP owns, declared per row, refused when unknown. `produces` stays what the user owns.
--
-- NULL IS THE COMMON CASE and means an ordinary document: draft it, file it, done. Most rows.
-- Adding a fifth value is a migration AND code, which is correct — a value the app has no
-- behaviour for would be a row that declares something nothing does.

alter table workflow_step add column if not exists output text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_output_known') then
    alter table workflow_step add constraint workflow_step_output_known
      check (output is null or output in ('roster', 'backlog', 'sprint'));
  end if;
end $$;

comment on column workflow_step.output is
  'What kind of thing this step produces, from a closed set the app implements: roster (the '
  'approved table becomes member rows), backlog (the agent gets the backlog tool; approval creates '
  'the issues), sprint (the sprint tool; approval labels the committed stories). NULL — the common '
  'case — is an ordinary document. Keyed on instead of `produces`, because `produces` is a path the '
  'user may rename and a rename must not silently disable behaviour.';

-- ── backfill from the paths the maps used to hold ────────────────────────────────────────────
-- The three registrations that existed in code, written onto the rows that had them. Matched on the
-- bare path, since a step may decorate `produces` with a destination (`…@tickets`) and the maps
-- always compared the undecorated form.
update workflow_step set output = 'roster'
 where output is null and split_part(produces, '@', 1) = '01-foundation/team';
update workflow_step set output = 'backlog'
 where output is null and split_part(produces, '@', 1) = '02-scope/deliverables';
update workflow_step set output = 'sprint'
 where output is null and split_part(produces, '@', 1) = '05-cadence/sprint-plans';

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'workflow_step'::regclass and attname = 'output' and not attisdropped) then
    raise exception 'workflow_step.output was not created';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_output_known') then
    raise exception 'workflow_step_output_known is missing — any string would be a behaviour';
  end if;
end $$;
