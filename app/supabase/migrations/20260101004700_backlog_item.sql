-- 047_backlog_item.sql — the product backlog as rows, between the draft and the board.
--
-- `draft-epics` produced a DOCUMENT, and the epics inside it were prose. Turning that back into
-- Jira issues would mean parsing headings — and this repo already learned what that costs:
-- `backlog-rows.ts` exists because it was done once, and `tools.ts` says plainly that an outcome
-- which has to become rows must arrive as structure, not as text to re-read.
--
-- So the agent returns the backlog through a tool, and it lands here. The document is still filed —
-- it is the readable record and what everything downstream cites — but the STRUCTURE lives in these
-- rows, and the rows are what becomes Jira.
--
-- Three things the shape is doing:
--
--   `ref` + `parent_ref` are the AGENT's own handles, not database ids. The model names an epic
--   `E1` and its stories `E1-S1`; those refs are what tie a child to its parent inside one turn,
--   before anything has an id. Unique per task, so a redraft cannot collide with the last one.
--
--   `ticket_key` is null until Jira accepts the issue. That is the idempotency hinge and the same
--   rule mirroring already follows: Jira first, then the row. A key written optimistically would
--   make a failed create permanent, because the next run would skip it as done.
--
--   `task_id` is what a row belongs to. A backlog is produced BY a task, and re-running that task
--   produces a new draft that must replace the old rows rather than accumulate beside them.

create table if not exists backlog_item (
  id            uuid primary key default gen_random_uuid(),
  org_id        text not null,
  engagement_id text not null references engagement(id) on delete cascade,
  task_id       uuid not null references work_task(id) on delete cascade,
  -- 'epic' or 'story'. Text rather than an enum: the tracker's vocabulary is the client's, and a
  -- Task or a Bug lands here the day a workflow produces one.
  kind          text not null,
  ref           text not null,
  parent_ref    text,
  title         text not null,
  body          text,
  ord           int  not null default 0,
  ticket_key    text,
  created_at    timestamptz not null default now(),
  created_by    text,
  updated_at    timestamptz not null default now(),
  updated_by    text
);

-- A ref is the agent's handle WITHIN one task's draft. Two tasks may both call an epic `E1`.
create unique index if not exists backlog_item_task_ref on backlog_item (task_id, ref);
create index if not exists backlog_item_engagement on backlog_item (engagement_id);
-- The lookup the mirror does: everything on this task that has no ticket yet.
create index if not exists backlog_item_pending on backlog_item (task_id) where ticket_key is null;

-- The audit trigger from 044 is attached per-table at migration time, so a table created afterwards
-- does not have it. Without this, `updated_at` here would be a column that never moves — the exact
-- false-green 044 was written to avoid.
drop trigger if exists touch_audit on backlog_item;
create trigger touch_audit before insert or update on backlog_item
  for each row execute function touch_audit_columns();

-- An optional question is one the human may leave unanswered without blocking the work.
--
-- "Do you have business requirements?" must not park a task forever when the answer is "no". The
-- distinction cannot be inferred from the text, and treating every unanswered question as blocking
-- is what makes an optional one indistinguishable from a missing answer.
alter table question add column if not exists optional boolean not null default false;

comment on column question.optional is
  'The human may leave this unanswered and the task still proceeds. Set by the agent when it asks '
  'for something it can do without — supporting material, not a blocking fact.';

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.backlog_item') is null then
    raise exception 'backlog_item was not created';
  end if;
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'question'::regclass and attname = 'optional' and not attisdropped) then
    raise exception 'question.optional is missing';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'backlog_item'::regclass and tgname = 'touch_audit' and not tgisinternal) then
    raise exception 'touch_audit is not attached to backlog_item — updated_at would never move';
  end if;
end $$;
