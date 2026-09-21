-- A deliverable has a declared shape, and it lives in the database.
--
-- `compass/templates/` ships sow.md, brief.md, architecture.md and thirty more. sow.md says in its
-- own header that "intake splits a SOW into sections on headings, and a section per heading is what
-- an agent cites". NOTHING IN THE APP READS ANY OF THEM: `buildContext` never passed a template and
-- `run.ts` never mentioned one, so the model invented a structure on every run and two runs of the
-- same row produced different headings. A document whose sections move is not reviewable, and a
-- comment anchored to one of those headings could never survive the next draft.
--
-- WHY A TABLE AND NOT `resolveSpec`. The obvious move was to read the file through `resolveSpec`,
-- which already walks engagement → org → repo and already lists `templates/` as editable. But it
-- resolves `COMPASS_DIR` to `process.cwd()/../compass` — a sibling directory on the filesystem.
-- Deploy the app without the repo beside it and every template resolves to null, which under the
-- halt rule in run.ts stops every templated row in production, at the exact moment nobody can add
-- the missing file. A row in the database has no such dependency, and it lets a client's SOW shape
-- be edited without a deploy, which is the thing a template is FOR.
--
-- WHY NOT THE BODY IN workflow-steps.csv. sow.md is 140 lines and foundation-architecture.md is
-- 293, with tables and blank lines. Inside a CSV cell that makes the seed unreadable, churns a step
-- row on every template tweak, and gives two steps producing the same deliverable their own copy to
-- drift apart. The step names the template; the table holds it.
--
-- NO VERSION HISTORY, deliberately. Latest template wins. A document drafted against an older shape
-- may not satisfy today's floor, and that surfaces the next time the row runs rather than being
-- carried forever by a pinned version. `workflow_run` pins its `workflow_version_id` because the
-- PROCESS must not change under a run in flight; the shape of a document is not that.

create table if not exists document_template (
  id             uuid primary key default gen_random_uuid(),
  -- Three scopes, resolved most-specific-first: an engagement row beats an org row beats the
  -- default (both null), which is what the framework ships. Same tiering `resolveSpec` gives a
  -- file, without the filesystem.
  org_id         uuid references org(id) on delete cascade,
  engagement_id  text references engagement(id) on delete cascade,
  -- What a step refers to. NOT a path: `produces` values are `product-brief` and
  -- `foundational-architecture` while the files are brief.md and foundation-architecture.md, so
  -- there is no convention to derive one from the other, and a path is one more thing that dangles.
  name           text not null,
  title          text not null default '',
  body           text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     text,
  -- A template with no body is worse than no template: it parses to zero sections, so the floor
  -- check passes vacuously and every draft satisfies it. That is the aggregate-over-zero-rows
  -- failure this repo keeps re-learning, so the database refuses it.
  constraint document_template_has_body check (length(btrim(body)) > 0)
);

-- One template per name per scope. Two would make "the shape of a SOW" ambiguous, and whichever
-- the database happened to return first would decide it.
--
-- Postgres treats NULLs as distinct in a unique index, so a single constraint over
-- (org_id, engagement_id, name) would NOT stop two default rows (both nulls) with the same name —
-- the exact case that matters most, since the default is what every engagement falls back to.
-- Three partial indexes, one per scope, say what is actually meant.
create unique index if not exists document_template_default_name
  on document_template (name) where org_id is null and engagement_id is null;
create unique index if not exists document_template_org_name
  on document_template (org_id, name) where org_id is not null and engagement_id is null;
create unique index if not exists document_template_engagement_name
  on document_template (engagement_id, name) where engagement_id is not null;

-- ── the step declares which one ──────────────────────────────────────────────────────────────
--
-- Null means free-form, and that is a legitimate answer: not every deliverable has a house shape.
-- What is NOT legitimate is a declared name that resolves to nothing, and that is a run-time halt
-- rather than a constraint here — the template it names may be created after the step is imported.

alter table workflow_step add column if not exists template text;

-- ── assert the effect ────────────────────────────────────────────────────────────────────────
--
-- A migration that reports "Finished" and changed nothing has happened in this repo before: an
-- `if not exists` guard found a same-named object from an older migration and skipped silently.
-- Checking here costs nothing and makes that impossible to miss.

do $$
begin
  if not exists (select 1 from information_schema.tables where table_name = 'document_template') then
    raise exception 'document_template was not created';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'workflow_step' and column_name = 'template'
  ) then
    raise exception 'workflow_step.template was not added';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'document_template_default_name') then
    raise exception 'the default-scope unique index was not created';
  end if;
end $$;
