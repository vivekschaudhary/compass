-- 012_story_role.sql — role label on stories (the routing axis for AI-native work).
-- Each story is owned by ONE delivery role (researcher | designer | ux-writer | engineer | automation);
-- the role is mirrored as a Jira label so each role can pull its own tickets. Run in Supabase. Idempotent.
alter table story add column if not exists role text;
create index if not exists story_role_idx on story(role);
