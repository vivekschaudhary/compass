-- 008_runs.sql — persist run logs + link activity rows to the run that produced them, so each
-- build/fix/re-run's full output (what ran, the failure or success) is viewable after the fact.
-- Run in the Supabase SQL editor.
alter table run add column if not exists log      text;   -- full captured stdout/stderr of the run
alter table run add column if not exists workflow text;   -- build | fix
alter table activity add column if not exists run_id text; -- the run whose log backs this entry (nullable)
