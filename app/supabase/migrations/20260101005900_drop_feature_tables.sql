-- 059_drop_feature_tables.sql — a feature is a page, so it stops being a table.
--
-- Migrations 050-053 built `feature`, `feature_metric`, `feature_metric_reading` and
-- `feature_decision`, and hung `feature_id` off `workflow_run`, `backlog_item` and `document`.
-- NOTHING HAS EVER WRITTEN OR READ ANY OF IT. Every `feature` hit in the app is the English word in
-- a comment; all four tables are empty; the `feature_id` columns have never been set.
--
-- WHY THIS IS NOT THE 047 ARGUMENT AGAIN. Epics and stories ARE rows (`backlog_item`), deliberately,
-- after being prose first and proving it did not hold: turning a document back into Jira issues
-- meant parsing headings, so "an outcome which has to become rows must arrive as structure". That
-- reasoning is about reaching the TRACKER. A feature never does — the hierarchy is
-- Feature -> Epic -> Story against Jira's Epic -> Story -> Sub-task, so a feature has no issue to
-- become. The thing that forced 047 is absent here, and without it a row buys nothing: nothing
-- iterates features, nothing links to them, nothing measures them.
--
-- THE CONCEPTS SURVIVE AS SECTIONS. This drops tables, not ideas. A feature still has a metric, a
-- measurement and a decision — they are SECTIONS OF THE FEATURE PAGE, gated by Done criteria on
-- `feature.draft-feature`, and the last two are reserved-and-empty until after launch rather than
-- absent. `feature_metric` becomes the Metric section, `feature_metric_reading` the Measurement
-- section, `feature_decision` the Decision section. `measure` and `learn` (both parked, no rows)
-- write into that page when they are built, instead of into a table nothing could read.
--
-- WHAT IS ACTUALLY GIVEN UP, STATED SO IT IS A DECISION AND NOT A DISCOVERY.
--   1. `feature-architecture` stays ONE shared document. A fan-out iterates rows, and features are
--      not rows anywhere — not here, and deliberately not in `backlog_item` either, since that
--      table is "the product backlog as rows, between the draft and the board" (047) and exists to
--      reach the TRACKER. A feature stops at Confluence: SOW/BR -> product brief -> foundation
--      architecture, design library, features -> [Jira] epics, stories, sub-tasks -> code. The
--      Confluence/Jira boundary is what decides this, not the absence of a table.
--   2. "Every epic belongs to a feature" stays a JUDGMENT criterion — a person attests it. The
--      link crosses that same boundary (a Jira epic to a Confluence page), so there are no two
--      rows to join.
--
-- DEAD SCHEMA THAT LOOKS ALIVE IS THE REASON THIS IS A DROP AND NOT A COMMENT. A table with a
-- thoughtful header, indexes and constraints reads as load-bearing to whoever finds it next; this
-- session lost time designing a fan-out over `feature` before checking whether anything filled it.
-- Leaving it in place preserves that trap for the next person.

-- ── the columns first, because they reference the table ──────────────────────────────────────
--
-- Dropping a column takes its constraints and indexes with it, so `workflow_run_feature_same_engagement`,
-- `workflow_run_feature_needs_engagement`, `workflow_run_by_feature`, `backlog_item_by_feature` and
-- `document_by_feature` need no separate statement.
alter table workflow_run drop column if exists feature_id;
alter table backlog_item drop column if exists feature_id;
alter table document     drop column if exists feature_id;

-- ── then the tables, deepest reference first ─────────────────────────────────────────────────
--
-- No `cascade`. Each one is named so that an unexpected dependency RAISES rather than being
-- silently swept up — if something does reference these after all, this migration must fail and
-- say so, not quietly delete whatever was attached.
drop table if exists feature_metric_reading;
drop table if exists feature_metric;
drop table if exists feature_decision;
drop table if exists feature;

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
--
-- `drop ... if exists` is exactly the shape that reports "Finished" having done nothing — the same
-- class as the `if not exists` guard that once found a same-named constraint and skipped.
do $$
declare
  v_left text;
begin
  select string_agg(table_name, ', ') into v_left
    from information_schema.tables
   where table_schema = 'public'
     and table_name in ('feature', 'feature_metric', 'feature_metric_reading', 'feature_decision');
  if v_left is not null then
    raise exception '059 left feature tables behind: %', v_left;
  end if;

  select string_agg(table_name || '.' || column_name, ', ') into v_left
    from information_schema.columns
   where table_schema = 'public'
     and column_name = 'feature_id'
     and table_name in ('workflow_run', 'backlog_item', 'document');
  if v_left is not null then
    raise exception '059 left feature_id columns behind: %', v_left;
  end if;
end $$;
