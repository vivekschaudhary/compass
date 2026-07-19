-- 011_metrics.sql — metric definitions captured in the DB, per project (SOW-level) and per epic
-- (the bet's measurable outcome). Values stay empty until instrumentation lands. Run in Supabase.
create table if not exists metric (
  id            text primary key,
  engagement_id text references engagement(id) on delete cascade,
  epic_id       text references epic(id) on delete cascade,   -- null = project / SOW-level
  scope         text,        -- product | engineering | bet
  category      text,        -- Acquisition | … | Delivery performance | Bet outcome
  name          text,
  target        text,        -- target from the SOW / bet (nullable, empty for now)
  value         text,        -- current measured value (nullable, empty for now)
  unit          text,
  ord           int default 0
);
create index if not exists metric_eng_idx on metric(engagement_id);
create index if not exists metric_epic_idx on metric(epic_id);
