-- 030_drop_unused.sql — remove the two tables I built and then didn't use.
--
-- Both are empty and neither is referenced by any code path:
--
--   phase                 built when phases still held state. They resolved into a display band
--                         computed from dependencies, so the table never had a row and never will.
--
--   document_permission   permissions are DERIVED from workflow steps instead — a role that
--                         produces a document edits it, a role whose step reads it reads it — so
--                         the table cannot drift from the process it describes. This was the
--                         override mechanism for exceptions that have not appeared.
--
-- Dropping now rather than "later" because an empty table is an invitation: the next person to
-- need permissions finds `document_permission` sitting there, writes to it, and now there are two
-- answers to who may edit a document. If explicit overrides are ever needed, adding the table back
-- is one migration — and it will arrive with the case that justifies it.
--
-- The v1 tables that overlap v2 (agent_question, chat_message, job, task, doc_page, spec_doc…) are
-- deliberately NOT touched. v1 still runs, and `doc_page` is what this engagement's document tree
-- was adopted from. Those belong to turning v1 off, which is its own piece of work.

do $$
begin
  if exists (select 1 from phase) then
    raise exception 'phase is not empty — someone started using it. Do not drop it; work out what they meant.';
  end if;
  if exists (select 1 from document_permission) then
    raise exception 'document_permission is not empty — explicit overrides exist. Reconcile them with the derived rules before dropping.';
  end if;
end $$;

drop table if exists document_permission;
drop table if exists phase;
