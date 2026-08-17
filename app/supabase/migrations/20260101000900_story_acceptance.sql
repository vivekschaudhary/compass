-- 009_story_acceptance.sql — per-story acceptance criteria (the Product Owner records it when
-- adding/refining a story). Run in the Supabase SQL editor.
alter table story add column if not exists acceptance text;
