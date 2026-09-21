-- A document version records WHO wrote it, and a section records whether a person rewrote it.
--
-- Until now every `document_version` came from an agent, so nothing needed to say so.
-- `created_by_task_id` records which task filed it, which is a different fact — a human editing a
-- draft on the job screen files from the same task the agent did, and the two versions would be
-- indistinguishable afterwards. "A named human reviewed it" is the product's claim; a document
-- whose history cannot tell an agent's draft from a person's rewrite cannot support it.
--
-- WHY THIS EXISTS AT ALL. The engagement cannot afford edits made outside Compass: an edit in
-- Confluence has no author, no version and no trail, and the next publish silently overwrites it.
-- The answer is not to forbid editing, it is to make editing HERE better — which means a person's
-- change has to be as well recorded as an agent's.
--
-- `document_section.edited` is about CITATIONS, not vanity. Every section names the documents it
-- was derived from, and the moment a person rewrites the prose those citations describe text that
-- no longer exists. A citation claiming a source the words do not come from is worse than no
-- citation: it is provenance that reads as verified and is not. The flag is what lets the reader
-- see the difference; it is carried forward across versions by whatever files them.

alter table document_version
  add column if not exists author_kind text not null default 'agent';

alter table document_version
  add column if not exists authored_by text;

-- Dropped and recreated rather than guarded with `if not exists (conname = ...)`. A named
-- constraint that must CHANGE and is skipped because something of the same name already exists is
-- a migration that reports "Finished" and did nothing — which has happened in this repo.
alter table document_version drop constraint if exists document_version_author_kind_known;
alter table document_version add constraint document_version_author_kind_known
  check (author_kind in ('agent', 'human'));

alter table document_section
  add column if not exists edited boolean not null default false;

-- Existing rows are agent-authored by definition: nothing but `runAgent` could file a version
-- before this migration, and nothing but a person can set `edited`.
update document_version set author_kind = 'agent' where author_kind is null;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'document_version' and column_name = 'author_kind'
  ) then
    raise exception 'document_version.author_kind was not added';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'document_section' and column_name = 'edited'
  ) then
    raise exception 'document_section.edited was not added';
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'document_version_author_kind_known'
  ) then
    raise exception 'the author_kind check constraint was not created';
  end if;
end $$;
