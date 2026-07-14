-- Compass migration 003 — per-engagement connectors + repo set + Confluence doc tree.
-- Run in the Supabase SQL Editor. Idempotent.

-- engagement connector fields
alter table engagement add column if not exists figma_url text;
alter table engagement add column if not exists confluence_space text;
alter table engagement add column if not exists confluence_root_page_id text;
alter table engagement add column if not exists jira_project text;
alter table engagement add column if not exists jira_board_id text;

-- the repo set (multi-repo): every story targets exactly one repo, resolved by area
create table if not exists repo (
  id             text primary key,
  engagement_id  text references engagement(id) on delete cascade,
  key            text,               -- short handle, e.g. "web"
  name           text,
  url            text,               -- remote (github/gitlab)
  area           text,               -- frontend | backend | qa-automation | infra | mobile | shared
  default_branch text default 'main',
  local_path     text,               -- local checkout the orchestrator runs against (--project-dir)
  build_cmd      text,
  test_cmd       text,
  ord            int default 0
);

-- the Confluence doc tree (scaffolded structure; confluence_page_id filled when created for real)
create table if not exists doc_page (
  id                 text primary key,   -- <engagement>-<path slug>
  engagement_id      text references engagement(id) on delete cascade,
  path               text,               -- e.g. "05/sprint-reviews"
  title              text,
  kind               text,               -- folder | doc | template
  parent_path        text,
  confluence_page_id text,
  confluence_url     text,
  status             text default 'pending',  -- created | pending
  ord                int default 0
);

-- seed Acme's connectors + repo set (demo)
update engagement set figma_url = 'https://figma.com/file/acme-customer-portal',
  confluence_space = 'ACME', jira_project = 'KAN', jira_board_id = '12'
  where id = 'acme';

delete from repo where engagement_id = 'acme';
insert into repo (id, engagement_id, key, name, url, area, default_branch, local_path, ord) values
  ('acme-web',   'acme', 'web',   'acme-portal-web',    'https://github.com/acme/portal-web',    'frontend',      'main', null, 1),
  ('acme-api',   'acme', 'api',   'acme-portal-api',    'https://github.com/acme/portal-api',    'backend',       'main', null, 2),
  ('acme-qa',    'acme', 'qa',    'acme-portal-e2e',    'https://github.com/acme/portal-e2e',    'qa-automation', 'main', null, 3),
  ('acme-infra', 'acme', 'infra', 'acme-portal-infra',  'https://github.com/acme/portal-infra',  'infra',         'main', null, 4);
