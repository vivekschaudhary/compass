-- 004_teams.sql — add Microsoft Teams / SharePoint as a second doc-storage provider,
-- alongside Confluence. Run in the Supabase SQL editor.

-- per-engagement provider choice + SharePoint target
alter table engagement add column if not exists docs_provider text not null default 'confluence';
alter table engagement add column if not exists teams_site text;           -- "host:/sites/Name", a webUrl, or a site id
alter table engagement add column if not exists teams_root_item_id text;    -- optional: a folder item id to root the tree under

-- generic external pointer on doc_page (provider-agnostic; confluence_* kept for back-compat)
alter table doc_page add column if not exists provider text default 'confluence';
alter table doc_page add column if not exists external_id text;
alter table doc_page add column if not exists external_url text;

-- backfill the generic columns from the existing Confluence rows
update doc_page set provider = coalesce(provider, 'confluence'),
                    external_id = coalesce(external_id, confluence_page_id),
                    external_url = coalesce(external_url, confluence_url)
where external_url is null and confluence_url is not null;
