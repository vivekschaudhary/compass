-- 007_activity.sql — per-role / per-user task history. Every completed action logs a row.
-- Run in the Supabase SQL editor.
create table if not exists activity (
  id            bigint generated always as identity primary key,
  engagement_id text references engagement(id) on delete cascade,
  role          text,        -- role code that owned the task (pm | engineer | support | …)
  actor         text,        -- the person who acted (member name), nullable
  kind          text,        -- bet | decompose | build | fix | triage | review | approve | deliver | blocked
  title         text,
  related       text,        -- jira key / epic / deliverable
  status        text default 'done',   -- done | failed | filed
  created_at    timestamptz default now()
);
create index if not exists activity_eng_idx on activity(engagement_id, created_at desc);
