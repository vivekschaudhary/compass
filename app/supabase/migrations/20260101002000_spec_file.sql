-- 020_spec_file.sql — per-org and per-engagement overrides of the framework's markdown.
--
-- Compass ships its workflows, agents, templates and config as files under compass/. That makes
-- one shared copy for every engagement, changeable only by someone with repo access. Two people
-- need to change it and neither should have to touch git: an ORG ADMIN setting how the firm works,
-- and a DELIVERY MANAGER adapting one client's process.
--
-- Three tiers, resolved in order:
--
--   engagement override   this client differs
--   org default           how we work        ← editable in the app, no repo access needed
--   compass/<path>        what Compass ships ← still git, versioned with the release
--
-- COPY-ON-WRITE. A row exists only for a file someone actually edited; everything else falls
-- through to the tier below. That is the whole point, and it is deliberately unlike
-- `doc_tree_spec`, which copies every node at provision time and therefore freezes an engagement
-- at its creation date — fix a default in July and a March engagement never sees it. Here, the
-- 99% of files nobody touched keep inheriting improvements.

create table if not exists spec_file (
  id            bigserial primary key,
  -- Exactly one of these is set; the pair IS the tier. Two nullable columns rather than a
  -- (scope, scope_id) pair because a polymorphic scope_id cannot carry a foreign key — and the
  -- cascade matters: deleting an engagement must take its overrides with it, or they linger as
  -- invisible rows that a later engagement id could collide with.
  org_id        text,
  engagement_id text references engagement(id) on delete cascade,
  path          text not null,                    -- relative to compass/ — 'workflows/build.md'
  content       text not null,
  -- The tier BELOW as it was when this was forked. Powers "the default changed since you edited
  -- this" without ever auto-merging (see the drift work).
  base_hash     text,
  updated_at    timestamptz default now(),
  updated_by    text,
  check ((org_id is null) <> (engagement_id is null)),
  unique nulls not distinct (org_id, engagement_id, path)
);

create index if not exists spec_file_org on spec_file(org_id, path);
create index if not exists spec_file_eng on spec_file(engagement_id, path);

-- Every save, so an edit that breaks a run at 2am can be walked back. Reverting to the tier below
-- is deleting the spec_file row, which is why history has to live somewhere else.
create table if not exists spec_file_version (
  id            bigserial primary key,
  org_id        text,
  engagement_id text,                              -- no FK: history outlives the engagement
  path          text not null,
  content       text not null,
  saved_at      timestamptz default now(),
  saved_by      text
);

create index if not exists spec_file_version_lookup
  on spec_file_version(path, saved_at desc);
