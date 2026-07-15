-- 013_tasks.sql — the "playbook": tracked tasks under a story. One table backs two kinds:
--   kind='task' — a promoted action item from an AI deliverable (the 80% AI-drafted / 20% user-added)
--   kind='ac'   — an acceptance-criteria checklist item (the definition of done)
-- Both are checkable + role-labeled so the AI-drafted plan becomes trackable work on the platform.
-- Run in Supabase. Idempotent.
create table if not exists task (
  id            bigint generated always as identity primary key,
  story_id      text references story(id) on delete cascade,
  title         text not null,
  role          text,                       -- owning delivery role (nullable for AC items)
  kind          text not null default 'task', -- task | ac
  status        text not null default 'todo', -- todo | doing | done (tasks); ac uses `done`
  done          boolean not null default false,
  ord           int default 0,
  created_at    timestamptz default now()
);
create index if not exists task_story_idx on task(story_id);
