-- 025_workspace_content.sql — documents, versions, sections, and provenance.
--
-- Compass owns the content. That is the decision this migration exists to make real: a document
-- is versioned rows here, and Confluence or Notion becomes a publish target rather than the home.
-- Without it, section-level provenance and "every reader sees v1.0" are things you cannot honestly
-- claim, because someone can edit the page underneath you.

-- ── preflight ───────────────────────────────────────────────────────────────────────────────
-- Same guard as 024, for the same reason: `create table if not exists` on a taken name does
-- nothing SILENTLY and the failure surfaces two statements later as a missing column. v1 has
-- `doc_page` and `doc_tree_spec`; none of these names should be taken, and if one is, say so.

do $$
declare taken text;
begin
  select string_agg(t.tablename, ', ') into taken
  from pg_tables t
  where t.schemaname = 'public'
    and t.tablename in ('document','document_version','document_section','citation','document_permission')
    and not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t.tablename
        and c.column_name in ('org_id','document_id','document_version_id','document_section_id')
    );
  if taken is not null then
    raise exception 'Name collision: % already exist(s) and are not ours. Rename rather than half-applying.', taken;
  end if;
end $$;

-- ── document ─────────────────────────────────────────────────────────────────────────────────
-- The scaffolding tree and the file, in one table. A folder is a document with kind='folder' and
-- no versions — the tree is content, not a separate structure to keep in step with it.

create table if not exists document (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references org(id) on delete cascade,
  engagement_id    text not null references engagement(id) on delete cascade,
  parent_id        uuid references document(id) on delete cascade,
  path             text not null,
  title            text not null,
  kind             text not null default 'doc',
  owner_role_code  text,
  external_url     text,                    -- where a published copy lives, if anywhere
  ord              int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (engagement_id, path),
  constraint document_kind_known check (kind in ('folder','doc','template'))
);

create index if not exists document_tree on document (engagement_id, parent_id, ord);

-- ── document_version ─────────────────────────────────────────────────────────────────────────
-- Publishing is a deliberate act and it is what moves 0.1 to 1.0. `created_by_task_id` is the job
-- that drafted it, so a document can always answer "which piece of work produced this".

create table if not exists document_version (
  id                 uuid primary key default gen_random_uuid(),
  document_id        uuid not null references document(id) on delete cascade,
  version            text not null,
  status             text not null default 'draft',
  created_by_task_id uuid references work_task(id) on delete set null,
  created_at         timestamptz not null default now(),
  published_at       timestamptz,
  published_by       text,
  unique (document_id, version),
  constraint document_version_status_known check (status in ('draft','published','superseded')),
  constraint document_version_published_has_when check (
    (status <> 'published') or (published_at is not null)
  )
);

-- One published version per document. Two would make "every reader sees that version" untrue, and
-- a partial unique index makes it a database error rather than a race nobody notices.
create unique index if not exists document_version_one_published
  on document_version (document_id) where status = 'published';

-- A folder has no content, so it cannot have a version. Enforced rather than assumed: a version
-- hanging off a folder is invisible in every UI and confusing in every query.
create or replace function document_version_not_on_folder() returns trigger as $$
declare k text;
begin
  select kind into k from document where id = new.document_id;
  if k = 'folder' then
    raise exception 'Document % is a folder and cannot have a version.', new.document_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists version_not_on_folder on document_version;
create trigger version_not_on_folder before insert on document_version
  for each row execute function document_version_not_on_folder();

-- ── document_section ─────────────────────────────────────────────────────────────────────────
-- Sections are rows because provenance attaches per section, not per file. "Every claim traced to
-- something in the content" is only checkable if a claim is addressable.

create table if not exists document_section (
  id                  uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references document_version(id) on delete cascade,
  ord                 int not null,
  heading             text not null default '',
  body                text not null default '',
  created_at          timestamptz not null default now(),
  unique (document_version_id, ord)
);

-- ── citation ─────────────────────────────────────────────────────────────────────────────────
-- THE WHOLE IDEA. A citation points at a VERSION, never at a path.
--
-- Edit the source afterwards and it becomes a new version, while every existing citation still
-- resolves to the text it was actually written from. Without `source_version_id` — not null, on
-- purpose — "traced to something in the content" degrades silently, and you only find out when
-- somebody checks one.
--
-- Read the other way, this table is the lineage graph. There is no second structure to maintain,
-- so the chain shown on Plan cannot disagree with the provenance under a section.

create table if not exists citation (
  id                  uuid primary key default gen_random_uuid(),
  document_section_id uuid not null references document_section(id) on delete cascade,
  source_document_id  uuid not null references document(id) on delete cascade,
  source_version_id   uuid not null references document_version(id) on delete cascade,
  locator             text,                 -- "themes 1 and 3", as the agent named it
  passage             text,                 -- the text it actually used, so a peek is possible
  created_at          timestamptz not null default now()
);

create index if not exists citation_by_section on citation (document_section_id);
create index if not exists citation_by_source  on citation (source_document_id);

-- ── document_permission ──────────────────────────────────────────────────────────────────────
-- Explicit rows only. The default is DERIVED from the workflow steps that read and produce a
-- document — a role that produces it edits it, a role that reads it reads it — and these rows
-- override that where a client's reality differs.

create table if not exists document_permission (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references document(id) on delete cascade,
  role_code    text not null,
  level        text not null,
  created_at   timestamptz not null default now(),
  unique (document_id, role_code),
  constraint document_permission_level_known check (level in ('owns','edits','reads'))
);

-- ── current version, as a column ─────────────────────────────────────────────────────────────
-- Maintained on write like every other projection here: reads stay a plain column select, and
-- Realtime has a real row to subscribe to when a document is published.

alter table document add column if not exists current_version_id uuid references document_version(id);

create or replace function document_track_current_version() returns trigger as $$
begin
  if new.status = 'published' then
    update document set current_version_id = new.id, updated_at = now() where id = new.document_id;

    insert into event (org_id, engagement_id, actor_kind, actor_role_code, actor_user_id,
                       subject_type, subject_id, verb, payload)
    select d.org_id, d.engagement_id, compass_actor_kind(), compass_actor_role(), compass_actor_id(),
           'document', d.id, 'document.published',
           jsonb_build_object('path', d.path, 'version', new.version)
      from document d where d.id = new.document_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists track_current_version on document_version;
create trigger track_current_version after insert or update on document_version
  for each row execute function document_track_current_version();
