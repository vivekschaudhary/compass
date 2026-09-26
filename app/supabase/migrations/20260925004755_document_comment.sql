-- document_comment.sql — a reviewer, or an owner, can say something about a PIECE of a document
-- rather than the whole thing.
--
-- `document_section` (workspace_content, 025) is already the addressable unit — provenance attaches
-- per section, not per file, for the same reason a comment should: "the milestone table's row for
-- M3 is wrong" is a useful thing to point at, "something in this document is wrong" is not.
--
-- NOT SCOPED TO A ROLE OR A TASK. Sections are per document VERSION, not per task — the timeline's
-- current section rows are the same rows whether they are read from `draft-timeline`'s own page or
-- from `approve-timeline`'s review of it, and a workflow can gate the same document through more
-- than one review role (`approve-research` then `approve-architecture`, in `foundation-architecture`,
-- both eventually read the same kind of thing). `author_role_code`/`author_user_id` say who left a
-- comment; nothing here says who is ALLOWED to — the app's own read/write scope check on
-- `document`/`document_section` (already engagement-scoped) is the boundary, same as `turn`.
--
-- ANCHORED TO A SECTION, NOT A CHARACTER RANGE. `quote` is the selected text, kept verbatim — it is
-- both the anchor (matched against the rendered section on read, to re-highlight it) and the
-- context (so the comment still reads once the highlight can no longer find it). A stored offset
-- would be exact until the very first edit and then be exact about the wrong text; a re-matched
-- quote degrades to "not highlighted, but still legible" instead.
--
-- STAYS ON THE VERSION IT WAS MADE ON. Editing a section files a NEW `document_section` row
-- (`document_edit.ts`/`editSectionAction`) — this table does not re-point a comment at it. A
-- comment surviving an edit unchanged would claim the new text was reviewed when it was not; that
-- re-anchoring question is left for the owner-facing "comments to fix" pass, not answered here by
-- pretending the version boundary does not exist.

create table if not exists document_comment (
  id                   uuid primary key default gen_random_uuid(),
  document_section_id uuid not null references document_section(id) on delete cascade,
  quote                text not null,
  body                 text not null,
  author_kind          text not null,
  author_role_code     text,
  author_user_id       text,
  status               text not null default 'open',
  resolved_by          text,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now(),
  constraint document_comment_author_kind_known check (author_kind in ('human', 'agent', 'system')),
  constraint document_comment_status_known check (status in ('open', 'resolved')),
  constraint document_comment_resolved_has_who check (
    (status <> 'resolved') or (resolved_by is not null and resolved_at is not null)
  ),
  constraint document_comment_quote_not_blank check (length(trim(quote)) > 0),
  constraint document_comment_body_not_blank check (length(trim(body)) > 0)
);

create index if not exists document_comment_by_section
  on document_comment (document_section_id, created_at);

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_class where relname = 'document_comment' and relkind = 'r') then
    raise exception 'document_comment was not created';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'document_comment_status_known') then
    raise exception 'document_comment_status_known is missing — any string would be a status';
  end if;
end $$;
