-- 033_document_publication.sql — record where a document was published, not just that it exists.
--
-- Compass authored documents into its own tables and published them nowhere. The framework has said
-- otherwise from the start — `[docs-primary]` (#154): "The page IS the record. Compass authors it,
-- publishes it under the engagement's parent page." A control tower whose output exists only inside
-- itself is invisible to the client team who work in Confluence, which is most of them.
--
-- The DB copy is not being demoted: it stays the structured record — versions, sections, citations,
-- the things a page cannot hold. What changes is that publishing is now part of filing, and the
-- page's identity is stored so the next publish updates that page rather than creating a duplicate.
--
-- Publication is tracked per VERSION, not per document. Which version a page currently shows is a
-- fact worth being able to answer, and "the document was published" cannot answer it.

alter table document_version add column if not exists external_id       text;
alter table document_version add column if not exists external_url      text;
alter table document_version add column if not exists published_to_docs_at timestamptz;
alter table document_version add column if not exists publish_error     text;

-- The page id lives on the document too: every version publishes to the SAME page, so the id is a
-- property of the document and the per-version row records which publish put what there.
alter table document add column if not exists external_id  text;
alter table document add column if not exists external_url text;

-- A publication either happened, with a page, or it did not. Half a record — a timestamp with no
-- page id — would read as published while pointing at nothing.
alter table document_version drop constraint if exists document_version_publication_complete;
alter table document_version add constraint document_version_publication_complete check (
  (published_to_docs_at is null and external_id is null) or
  (published_to_docs_at is not null and external_id is not null)
);

create index if not exists document_version_unpublished
  on document_version (document_id)
  where status = 'published' and published_to_docs_at is null;
