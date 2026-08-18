-- 015_doc_tree.sql — per-engagement, refinable copy of the workspace doc tree.
-- Seeded from compass/templates/doc-tree.md at kickoff (intake), refined + approved before the
-- folders/pages are actually created. The default lives in the framework spec; this table is the
-- engagement's own (possibly diverged) structure. [sprint-0-materializes-refinable-defaults]

create table if not exists doc_tree_spec (
  engagement_id text references engagement(id) on delete cascade,
  path          text not null,
  title         text not null,
  kind          text not null default 'doc',   -- folder | doc | template
  parent_path   text default '',
  body          text,                           -- optional per-node body override (else generated)
  ord           int  default 0,
  primary key (engagement_id, path)
);

create index if not exists doc_tree_spec_eng on doc_tree_spec(engagement_id);

-- Whole-tree approval — part of Sprint 0 ticket 1 `docs.wired` (adapter wired AND scaffold created
-- from the approved tree). Folders are only created once this flips true.
alter table engagement add column if not exists doc_tree_approved boolean default false;
