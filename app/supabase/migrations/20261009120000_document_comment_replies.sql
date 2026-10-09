-- document_comment_replies.sql — a comment can now be ANSWERED, and the answer can be accepted or
-- declined. Groundwork for "the drafter's side responds to review comments without reopening the
-- task"; nothing here changes what an existing comment means.
--
-- A REPLY IS A ROW IN THE SAME TABLE. `parent_id` points at the top-level comment it answers.
-- Only top-level comments are resolvable and only they will count toward the approval gate; a reply
-- is the conversation under one, never a second thing to resolve. Enforced, not assumed: a reply
-- cannot be 'resolved' (check), cannot answer another reply, and must sit on its parent's section
-- (trigger — a check cannot read another row).
--
-- THE AGENT'S ANSWER IS A REPLY WITH A `stance`. 'change' (it would alter the text) or 'no_change'
-- (it would not, and says why in `body`). `overlaps_with` names the other comments the same fix
-- would cover, so a reviewer sees "same as the one above" rather than three proposals for one edit.
-- The decision on an answer — `decision`, `decided_by`, `decided_at` — lives on the answer row, not
-- on the comment: the comment's own state stays open/resolved, and a declined answer does not
-- resolve anything. Several answers may exist for one comment (a declined one is followed by a
-- fresh attempt); the latest by `created_at` is the live one.
--
-- WHY `quote` MAY BE EMPTY ON A REPLY. The original check made every comment carry a non-blank
-- quote, which is right for something anchored to text and meaningless for a reply, whose anchor is
-- its parent. That named constraint has to CHANGE, so it is dropped and recreated — an
-- `if not exists` on the old name would find it and silently keep the old rule.

alter table document_comment
  add column if not exists parent_id     uuid references document_comment(id) on delete cascade,
  add column if not exists stance        text,
  add column if not exists overlaps_with uuid[] not null default '{}',
  add column if not exists decision      text,
  add column if not exists decided_by    text,
  add column if not exists decided_at    timestamptz;

alter table document_comment drop constraint if exists document_comment_quote_not_blank;
alter table document_comment add constraint document_comment_quote_not_blank check (
  parent_id is not null or length(trim(quote)) > 0
);

alter table document_comment drop constraint if exists document_comment_stance_known;
alter table document_comment add constraint document_comment_stance_known check (
  stance is null or stance in ('change', 'no_change')
);

alter table document_comment drop constraint if exists document_comment_decision_known;
alter table document_comment add constraint document_comment_decision_known check (
  decision is null or decision in ('accepted', 'declined')
);

-- A stance only means something on a reply, and a decision only on an answer (a reply with a
-- stance). A decision names who and when, the same way a resolution does.
alter table document_comment drop constraint if exists document_comment_stance_on_reply;
alter table document_comment add constraint document_comment_stance_on_reply check (
  stance is null or parent_id is not null
);

alter table document_comment drop constraint if exists document_comment_decision_on_answer;
alter table document_comment add constraint document_comment_decision_on_answer check (
  decision is null or stance is not null
);

alter table document_comment drop constraint if exists document_comment_decision_has_who;
alter table document_comment add constraint document_comment_decision_has_who check (
  (decision is null) or (decided_by is not null and decided_at is not null)
);

-- A reply is part of a conversation, not a thing with its own status.
alter table document_comment drop constraint if exists document_comment_reply_not_resolvable;
alter table document_comment add constraint document_comment_reply_not_resolvable check (
  parent_id is null or status = 'open'
);

create index if not exists document_comment_by_parent
  on document_comment (parent_id, created_at) where parent_id is not null;

-- A reply answers a top-level comment, on that comment's own section.
create or replace function document_comment_check_parent() returns trigger
language plpgsql as $$
declare
  parent record;
begin
  if new.parent_id is null then
    return new;
  end if;
  select parent_id, document_section_id into parent
    from document_comment where id = new.parent_id;
  if not found then
    raise exception 'document_comment: parent % does not exist', new.parent_id;
  end if;
  if parent.parent_id is not null then
    raise exception 'document_comment: a reply cannot answer another reply';
  end if;
  if parent.document_section_id is distinct from new.document_section_id then
    raise exception 'document_comment: a reply must sit on its parent''s section';
  end if;
  return new;
end $$;

drop trigger if exists document_comment_check_parent on document_comment;
create trigger document_comment_check_parent
  before insert or update of parent_id, document_section_id on document_comment
  for each row execute function document_comment_check_parent();

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'document_comment' and column_name = 'parent_id') then
    raise exception 'document_comment.parent_id was not added';
  end if;
  -- The one that had to CHANGE: it must now permit an empty quote on a reply, and only there.
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'document_comment_quote_not_blank'))
       not like '%parent_id IS NOT NULL%' then
    raise exception 'document_comment_quote_not_blank still has the old rule — a reply could not be filed';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'document_comment_check_parent') then
    raise exception 'document_comment_check_parent trigger is missing — a reply could answer a reply';
  end if;
end $$;
