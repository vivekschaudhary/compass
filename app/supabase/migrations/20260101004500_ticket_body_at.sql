-- 045_ticket_body_at.sql — when a ticket's body was last composed, so it is composed once.
--
-- Mirroring puts an epic and its stories on the board with a placeholder description; a separate
-- pass has a role compose the real body from its agent markdown and PATCHes it in. That pass is
-- re-runnable by design — it is also the repair path for the one-liners already on a board — and a
-- re-run must not spend a model call, or rewrite a body a human has since edited in Jira.
--
-- Hence a stamp rather than a boolean: "when" answers "has it" and also says whether the body
-- predates a change to the row it was written from.
--
-- Written AFTER Jira accepts the PATCH, never before. A stamp written first would make a failed
-- write permanent — the next run would skip the ticket as done and it would keep its placeholder
-- for ever, which is the silent-pass shape rule 11 names.

alter table work_task    add column if not exists ticket_body_at timestamptz;
alter table workflow_run add column if not exists ticket_body_at timestamptz;

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
--
-- `add column if not exists` is exactly the shape that has reported "Finished" and changed nothing
-- in this repo before, when an older migration had already created a same-named object.
do $$
declare
  v_missing text;
begin
  select string_agg(t, ', ' order by t) into v_missing
    from unnest(array['work_task', 'workflow_run']) as t
   where not exists (
     select 1 from pg_attribute a
      where a.attrelid = t::regclass and a.attname = 'ticket_body_at' and not a.attisdropped);
  if v_missing is not null then
    raise exception 'ticket_body_at is missing on: %', v_missing;
  end if;
end $$;
