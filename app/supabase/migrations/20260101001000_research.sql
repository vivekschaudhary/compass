-- 010_research.sql — the discovery loop: a research draft + its approval state, per epic.
-- Run in the Supabase SQL editor.
alter table epic add column if not exists research_status  text default 'none';  -- none | draft | approved
alter table epic add column if not exists research_url      text;  -- link to the drafted research doc (Confluence/Teams)
alter table epic add column if not exists research_summary  text;  -- the findings text, cached so Refine needn't re-fetch
