-- 051_feature_edges.sql — what a feature owns, and what makes its loop a POSITION rather than a
-- status.
--
-- THE LOOP IS A REPEATABLE RUN. `workflow.repeatable` already exists — 048 added it so sprint 2
-- could open after sprint 1 closed, and wrote down why a literal `code = 'sprint'` was refused. A
-- build/measure/learn loop is the same shape: a workflow whose steps are the three phases, opened
-- again each time the feature goes round. Pointing `workflow_run` at a feature is therefore the
-- WHOLE of the loop's state. Which phase a feature is in = the open run's current step. Which turn
-- of the loop it is on = how many runs it has had. Neither can drift from the work, because neither
-- is written down twice.
--
-- This is the reason 050 has no `stage` column, and it is worth being explicit: if a later change
-- adds one, these three edges become decoration and the column becomes the thing that lies.
--
-- WHY THE THREE EDGES ARE NOT THE SAME STRENGTH
--
--   workflow_run  — a COMPOSITE foreign key against feature (engagement_id, id), so a run cannot
--                   attach to a feature belonging to a different engagement. `on delete cascade`:
--                   a loop run whose feature is gone is not a run of anything. Because a composite
--                   FK with a null in either column is not checked at all (MATCH SIMPLE), a check
--                   constraint closes the one hole — a run may not claim a feature while having no
--                   engagement.
--
--   backlog_item  — a simple foreign key, `on delete set null`. The same-engagement guarantee
--                   CANNOT be expressed compositely here: `set null` would have to null
--                   `engagement_id` too, and that column is NOT NULL, so the delete would fail at
--                   runtime instead of at review time. An epic outliving its feature is correct —
--                   the Jira issue still exists — so the weaker edge is the right one and the gap
--                   is named rather than hidden.
--
--   document      — same reasoning as backlog_item. A feature brief survives its feature.
--
-- NULL IS THE NORMAL CASE ON ALL THREE. Setup and sprint 0 belong to the engagement, not to any
-- feature; their runs, documents and backlog rows keep a null feature_id forever. So every index
-- here is partial, and nothing may treat null as "feature unknown".

alter table workflow_run add column if not exists feature_id uuid;
alter table backlog_item add column if not exists feature_id uuid references feature(id) on delete set null;
alter table document     add column if not exists feature_id uuid references feature(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_run_feature_same_engagement') then
    alter table workflow_run add constraint workflow_run_feature_same_engagement
      foreign key (engagement_id, feature_id) references feature (engagement_id, id) on delete cascade;
  end if;
  -- The MATCH SIMPLE hole: engagement_id null means the composite key is never checked, and the
  -- run would carry an unverified feature. A run belonging to a feature belongs to an engagement.
  if not exists (select 1 from pg_constraint where conname = 'workflow_run_feature_needs_engagement') then
    alter table workflow_run add constraint workflow_run_feature_needs_engagement
      check (feature_id is null or engagement_id is not null);
  end if;
end $$;

-- The lookups the loop does: this feature's runs, this feature's epics, this feature's documents.
create index if not exists workflow_run_by_feature on workflow_run (feature_id, state)
  where feature_id is not null;
create index if not exists backlog_item_by_feature on backlog_item (feature_id)
  where feature_id is not null;
create index if not exists document_by_feature on document (feature_id)
  where feature_id is not null;

comment on column workflow_run.feature_id is
  'The feature this run is a turn of the loop for. THIS IS THE LOOP''S STATE: the open run and its '
  'current step are where the feature is (build / measure / learn), and the count of runs is which '
  'turn it is on. Null on every engagement-level phase — setup, sprint 0, a sprint.';
comment on column backlog_item.feature_id is
  'The feature this epic or story was drafted for. Null for backlog produced at engagement level. '
  'Survives the feature being deleted, because the tracker issue does.';
comment on column document.feature_id is
  'The feature this document belongs to, when it belongs to one rather than to the engagement.';

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
declare
  r text;
begin
  foreach r in array array['workflow_run', 'backlog_item', 'document'] loop
    if not exists (
      select 1 from pg_attribute
       where attrelid = r::regclass and attname = 'feature_id' and not attisdropped) then
      raise exception '%.feature_id was not created', r;
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'workflow_run_feature_same_engagement') then
    raise exception 'workflow_run_feature_same_engagement is missing — a run could join another engagement''s feature';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workflow_run_feature_needs_engagement') then
    raise exception 'workflow_run_feature_needs_engagement is missing — the composite key''s null hole is open';
  end if;
  if to_regclass('public.workflow_run_by_feature') is null then
    raise exception 'workflow_run_by_feature index was not created — resolving a feature''s loop state would seq-scan';
  end if;
end $$;
