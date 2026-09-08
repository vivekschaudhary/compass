-- 052_feature_metric.sql — measure. What the bet is judged on, and what has actually been observed.
--
-- `measurement` is already taken and is NOT this: it holds one boolean per acceptance criterion per
-- task — a gate verdict on a piece of work. This is the outcome of a bet in the world, over time.
--
-- TWO TABLES, NOT ONE. A single `feature_metric` row with `target` and `current_value` cannot tell
-- "we set a target and have never measured it" apart from "we measured it and it is zero". That is
-- exactly the false-green rule 11 names, and it is the failure mode a measure step is most likely
-- to hit — the metric was defined at the start of the loop and nobody wired the collection up. Split
-- in two, an unmeasured metric is a metric with no readings, and that is a visible, countable fact
-- the learn gate can refuse on.
--
-- `target` IS NOT NULL, deliberately. A metric with no target cannot decide anything; it can only
-- be reported. Allowing null would let a loop reach its learn step with nothing to compare against
-- and no failure anywhere — the aggregate-over-zero-rows shape, one level up.
--
-- `direction` because a target is not always a floor. Time-to-first-action wants to go down; sign-up
-- rate wants to go up. Without it, "did we hit it?" cannot be computed and has to be re-decided by
-- whoever is reading, every time.
--
-- `query` because a reading nobody can reproduce is an anecdote. It is how the value was fetched —
-- a GA4 expression, a JQL string, a SQL fragment — stored next to what it produced.
--
-- `observed_at` IS NOT A CREATION MOMENT, which is why this table keeps `created_at` where 044's
-- convention would otherwise drop it. A reading backfilled today for last Tuesday has two different
-- and both-true timestamps: when the world was that way, and when we learned it.
--
-- WHAT IS NOT HERE: a computed "did we hit target" column. It is arithmetic over the latest reading
-- and the target, and storing it would freeze an answer that changes with the next reading.

create table if not exists feature_metric (
  id          uuid primary key default gen_random_uuid(),
  feature_id  uuid not null references feature(id) on delete cascade,
  name        text not null,
  unit        text,
  -- which way is good. 'up' — higher is better; 'down' — lower is better.
  direction   text not null default 'up',
  -- where it stood before the bet. Null means it was never measured beforehand, which is a real
  -- and different thing from zero.
  baseline    numeric,
  -- the number this bet is judged against. NOT NULL: see the header.
  target      numeric not null,
  source      text not null,               -- ga4 | posthog | jira | github | manual
  query       text,                        -- how a reading is reproduced
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  unique (feature_id, name),
  constraint feature_metric_direction_known check (direction in ('up', 'down'))
);

create index if not exists feature_metric_by_feature on feature_metric (feature_id);

create table if not exists feature_metric_reading (
  id          uuid primary key default gen_random_uuid(),
  metric_id   uuid not null references feature_metric(id) on delete cascade,
  value       numeric not null,
  -- when the world was this way
  observed_at timestamptz not null,
  -- the measure task that fetched it, so a reading can answer "which piece of work produced this",
  -- the same question document_version.created_by_task_id answers.
  collected_by_task_id uuid references work_task(id) on delete set null,
  source      text not null,
  -- when we learned it. Distinct from observed_at on purpose — see the header.
  created_at  timestamptz not null default now(),
  created_by  text,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  -- Re-running a measure task over the same window must correct the reading, not add a second one
  -- beside it. Two values for one instant is a metric that cannot be plotted.
  unique (metric_id, observed_at)
);

-- The read the learn step does: this metric's readings, newest first.
create index if not exists feature_metric_reading_series
  on feature_metric_reading (metric_id, observed_at desc);

comment on table feature_metric is
  'What a bet is judged on. Definition only — the observed values are feature_metric_reading rows, '
  'kept separate so a metric that was never measured is visibly empty rather than silently zero.';
comment on column feature_metric.target is
  'The number the bet is judged against. NOT NULL: a metric with no target lets a learn step run '
  'with nothing to compare and fail nowhere.';
comment on column feature_metric_reading.observed_at is
  'When the world was this way — NOT when the row was written (that is created_at). A reading '
  'backfilled today for last week has both, and they differ.';

-- 044's trigger is attached per-table at migration time; tables created later must attach it.
drop trigger if exists touch_audit on feature_metric;
create trigger touch_audit before insert or update on feature_metric
  for each row execute function touch_audit_columns();
drop trigger if exists touch_audit on feature_metric_reading;
create trigger touch_audit before insert or update on feature_metric_reading
  for each row execute function touch_audit_columns();

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
declare
  r text;
begin
  foreach r in array array['feature_metric', 'feature_metric_reading'] loop
    if to_regclass('public.' || r) is null then
      raise exception '% was not created', r;
    end if;
    if not exists (
      select 1 from pg_trigger
       where tgrelid = r::regclass and tgname = 'touch_audit' and not tgisinternal) then
      raise exception 'touch_audit is not attached to % — updated_at would never move', r;
    end if;
  end loop;
  -- The header's central claim. If target ever becomes nullable, the learn gate loses its floor.
  if exists (
    select 1 from pg_attribute
     where attrelid = 'feature_metric'::regclass and attname = 'target' and not attnotnull) then
    raise exception 'feature_metric.target is nullable — a metric with no target can decide nothing';
  end if;
end $$;
