-- 050_feature.sql — the level between a product and its epics, and the thing a BML loop is about.
--
-- Today an epic's only parent is the TASK that drafted it (`backlog_item.task_id`) and, once
-- mirrored, its Jira key. That is enough to get issues onto a board and not enough to ask the
-- question a product company actually asks: "did this bet work?" A task is a unit of work; it
-- cannot carry a hypothesis, it cannot be measured, and it does not survive being re-run.
--
-- So: `feature`. One row per bet — the unit that gets built, measured and learned from. Epics hang
-- beneath it, and the loop runs against it.
--
-- WHAT IS DELIBERATELY NOT HERE
--
--   No `stage` column. `build | measure | learn` as a hand-maintained field is a second truth, and
--   it is wrong the first moment a build finishes and nobody flips it. Where a feature sits in its
--   loop is COMPUTED from its open workflow_run and that run's step position — the same way a
--   phase's state is already computed, and by construction unable to disagree with the work. 051
--   adds the edge that makes this possible.
--
--   No `status` / `outcome`. The verdict of a loop belongs to the turn of the loop that reached it,
--   not to the feature — a feature that persevered twice and then pivoted has three verdicts and a
--   single column can only remember the last. `feature_decision` (053) holds them, one per run.
--
--   No metric columns. 052.
--
-- `code` IS THE AGENT'S HANDLE, not an id — the same reasoning `backlog_item.ref` carries. The
-- model names a feature `F1` when drafting, before anything has a uuid, and children refer to it by
-- that name. Unique per engagement so two products may both have an `F1`.
--
-- `retired_at` RATHER THAN A DELETE. A killed feature is the most informative row in the table: it
-- is where the learning is. It stops appearing in the queue and stays readable forever.

create table if not exists feature (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references org(id) on delete cascade,
  engagement_id  text not null references engagement(id) on delete cascade,
  -- the agent's own handle, e.g. 'F1'
  code           text not null,
  title          text not null,
  -- what we believe, stated as an outcome. Null while a feature is still being framed.
  hypothesis     text,
  -- the readable record: the feature brief, filed like every other deliverable
  brief_doc_id   uuid references document(id) on delete set null,
  ord            int not null default 0,
  -- set when the loop reaches a kill, or the bet is abandoned. Never deleted.
  retired_at     timestamptz,
  created_at     timestamptz not null default now(),
  created_by     text,
  updated_at     timestamptz not null default now(),
  updated_by     text,
  unique (engagement_id, code),
  -- 051 points workflow_run at (engagement_id, id) so a run cannot attach to a feature belonging to
  -- a different engagement. A composite foreign key needs a unique key of exactly that shape.
  unique (engagement_id, id)
);

-- The list every product view asks for: this engagement's live features, in order.
create index if not exists feature_by_engagement on feature (engagement_id, ord)
  where retired_at is null;

comment on table feature is
  'A bet. The unit that is built, measured and learned from, sitting between an engagement/product '
  'and its epics. Where it is in its loop is not stored — it is computed from the open workflow_run '
  'carrying this feature_id.';
comment on column feature.code is
  'The agent''s handle for this feature within a draft (F1, F2 ...), not a database id. Unique per '
  'engagement, so children can name a parent before it has a uuid.';
comment on column feature.retired_at is
  'When this bet stopped. A killed feature is kept — the learning lives in it — and merely drops '
  'out of the live list.';

-- The audit trigger from 044 is attached per-table AT MIGRATION TIME, so a table created afterwards
-- does not have it. Without this, `updated_at` would be a column that never moves.
drop trigger if exists touch_audit on feature;
create trigger touch_audit before insert or update on feature
  for each row execute function touch_audit_columns();

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.feature') is null then
    raise exception 'feature was not created';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'feature'::regclass and tgname = 'touch_audit' and not tgisinternal) then
    raise exception 'touch_audit is not attached to feature — updated_at would never move';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'feature'::regclass and contype = 'u'
       and conkey = array[
         (select attnum from pg_attribute where attrelid = 'feature'::regclass and attname = 'engagement_id'),
         (select attnum from pg_attribute where attrelid = 'feature'::regclass and attname = 'id')
       ]::int2[]) then
    raise exception 'feature has no unique (engagement_id, id) — 051 cannot enforce same-engagement runs';
  end if;
end $$;
