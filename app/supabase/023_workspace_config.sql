-- 023_workspace_config.sql — the configuration half of the v2 workspace.
--
-- What an org defines and a project overrides: practices, roles, and the workflows a practice owns.
-- Execution (runs, tasks, events) and content (documents, versions, citations) follow in later
-- migrations; nothing here depends on them, and the importer exercises exactly these tables.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Conventions applied to every table, so they are not re-decided per table:
--
--   uuid primary keys           Generated, so a client can name a row before a round trip, and so
--                               row counts do not leak how many clients there are.
--
--   NATURAL KEYS ALONGSIDE      Every importable table has a human-readable `code`. This is
--                               load-bearing, not cosmetic: the authoring surface is a CSV, and
--                               nobody hand-writes a uuid. Imports reference codes; uuids stay
--                               internal.
--
--   org_id + engagement_id      On every table, denormalised on purpose. Row-level security keys
--                               off a column on the row it protects, so adding these later means
--                               rewriting policies and backfilling under load. There is no RLS
--                               today — isolation lives in the app's data layer — but the schema
--                               is shaped so it can be switched on without a reshape.
--
--   engagement_id IS NULL       Means "this org's default". A row with a value is that project's
--                               override. Same two-tier shape `spec_file` already uses.
--
--   text + check, not enum      Adding a value to a Postgres enum is a migration and a lock, and
--                               every one of these vocabularies will grow.
--
--   cascade on delete           Deliberate for now: end-to-end testing means deleting engagements
--                               often. AT LAUNCH, `event` moves to restrict — deleting an
--                               engagement must not silently erase the record of what happened in
--                               it. That table lands in the execution migration; the note lives
--                               here because this is where the convention is set.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ── org ──────────────────────────────────────────────────────────────────────────────────────
-- Multi-tenancy is real (many orgs), so this is a table rather than the implied 'default' string
-- that `app_user.org_id` has carried until now.

create table if not exists org (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── phase ────────────────────────────────────────────────────────────────────────────────────
-- A band drawn across the practices, and nothing more. It carries NO state and gates NOTHING:
-- readiness comes from a workflow's criteria, computed from real artifact state. The previous
-- attempt at a phase with derived completion could not be trusted and its screen was disabled;
-- a phase that cannot assert anything cannot repeat that.

create table if not exists phase (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references org(id) on delete cascade,
  engagement_id  text references engagement(id) on delete cascade,
  code           text not null,
  label          text not null,
  ord            int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique nulls not distinct (org_id, engagement_id, code)
);

-- ── workstream ───────────────────────────────────────────────────────────────────────────────
-- A practice — a community of practice that OWNS its workflows and improves them over time.
-- Also the grouping a role's `scope: workstream` resolves against, so it does two jobs.

create table if not exists workstream (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references org(id) on delete cascade,
  engagement_id  text references engagement(id) on delete cascade,
  code           text not null,
  label          text not null,
  ord            int  not null default 0,
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique nulls not distinct (org_id, engagement_id, code)
);

-- ── role ─────────────────────────────────────────────────────────────────────────────────────
-- Replaces COMPASS_ROLES, ROLE_WORKFLOWS, GRANTS and OVERSIGHT_ROLES — four hand-kept lists in
-- the v1 app, two of which duplicated data that already existed elsewhere.
--
-- `agent` must resolve to a real compass/agents/<x>.md. A role whose agent file does not exist
-- can never dispatch work: it produces a switcher entry and a permanently empty queue. The
-- importer validates this; the database cannot.
--
-- NOTE ON `workstream_code`: a text reference, not a foreign key, and deliberately. Config is
-- two-tier — an engagement-level role may reference an org-level workstream, and a foreign key
-- would pin it to one tier's row. Resolution happens the same way reads do: engagement row first,
-- org row second. The importer refuses unresolvable codes.

create table if not exists role (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references org(id) on delete cascade,
  engagement_id   text references engagement(id) on delete cascade,
  code            text not null,
  label           text not null,
  title           text not null default '',
  tier            text not null default 'practitioner',
  scope           text not null default 'mine',
  workstream_code text,
  agent           text,
  hosts           text[] not null default '{}',
  capabilities    text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique nulls not distinct (org_id, engagement_id, code),
  constraint role_tier_known  check (tier  in ('oversight','practitioner','platform')),
  constraint role_scope_known check (scope in ('mine','workstream','everyone'))
);

-- `manage-roles` is NOT grantable here, and its absence is the point. If the capability that
-- guards role editing were itself a row, any role able to edit roles could grant itself
-- everything. It stays a fixed grant in code. Everything else may be data.
alter table role drop constraint if exists role_no_self_grant;
alter table role add constraint role_no_self_grant
  check (not ('manage-roles' = any (capabilities)));

-- ── workflow ─────────────────────────────────────────────────────────────────────────────────
-- Owned by exactly one practice. `phase_code` decides only which band it is drawn in.
-- `trigger` is what opens a run: another workflow closing, a cadence firing, or a lifecycle
-- moment such as `project-created`.

create table if not exists workflow (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references org(id) on delete cascade,
  engagement_id    text references engagement(id) on delete cascade,
  code             text not null,
  label            text not null,
  workstream_code  text not null,
  phase_code       text,
  owner_role_code  text,
  trigger          text,
  enabled          boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique nulls not distinct (org_id, engagement_id, code)
);

-- ── workflow_version ─────────────────────────────────────────────────────────────────────────
-- A practice improving its workflow changes the definition. If a run referenced only THE
-- workflow, every past run would silently inherit today's process and the record of what
-- actually happened would be lost. Runs pin a version — the same mechanism a citation uses to pin
-- a document version — which is what lets you say "these twelve runs followed v1, these four
-- follow v2, and v2 closes two days faster".
--
-- Importing a changed workflow creates a version. It never mutates one.

create table if not exists workflow_version (
  id           uuid primary key default gen_random_uuid(),
  workflow_id  uuid not null references workflow(id) on delete cascade,
  version      int  not null,
  status       text not null default 'published',
  notes        text,
  created_by   text,
  created_at   timestamptz not null default now(),
  unique (workflow_id, version),
  constraint workflow_version_status_known check (status in ('draft','published','superseded'))
);

create unique index if not exists workflow_version_one_published
  on workflow_version (workflow_id) where status = 'published';

-- ── workflow_step ────────────────────────────────────────────────────────────────────────────
-- The dispatch graph, as rows. `kind` is load-bearing:
--
--   agent    real work, with a role who holds it
--   hitl     a human approval gate
--   machine  a mechanical check (CI, branch protection). NOBODY holds it, so it must never
--            become a card in a queue — it belongs on a gate as a criterion instead.
--
-- Steps are a graph, not a list: `conditional` carries the branch a step belongs to, and a run
-- materialises a task only when it reaches that step. Creating every step's task up front would
-- make every triage look half-abandoned.

create table if not exists workflow_step (
  id                   uuid primary key default gen_random_uuid(),
  workflow_version_id  uuid not null references workflow_version(id) on delete cascade,
  ord                  int  not null,
  kind                 text not null default 'agent',
  role_code            text,
  task                 text not null,
  produces             text,
  reads                text[] not null default '{}',
  conditional          text,
  created_at           timestamptz not null default now(),
  unique (workflow_version_id, ord),
  constraint workflow_step_kind_known check (kind in ('agent','hitl','machine')),
  -- A step someone must hold needs a role; a machine check must not have one.
  constraint workflow_step_role_matches_kind check (
    (kind in ('agent','hitl') and role_code is not null) or
    (kind = 'machine'         and role_code is null)
  )
);

-- ── criterion ────────────────────────────────────────────────────────────────────────────────
-- Definition of Ready and Definition of Done, on the workflow and on its steps.
--
-- These are not only gate enforcement. Their more important job is that they go INTO THE AGENT'S
-- CONTEXT: the Done list is its stopping condition, and an agent given no statement of done keeps
-- going until it runs out of ideas. The Ready list is why it may refuse rather than invent its
-- missing inputs.
--
-- `step_ord` null means the criterion belongs to the workflow as a whole — checked when the last
-- task closes, and never shown on an individual task's card. A task shows its own step's list
-- only; the two levels are separate lists about separate objects, not one list assembled from two
-- places.
--
-- Structured, not an expression language. `subject_kind = 'ticket'` covers most of them, which is
-- what makes "state comes from the tracker" true rather than aspirational. A criterion with no
-- subject is judgment — a human decides, and the card says so.

create table if not exists criterion (
  id                   uuid primary key default gen_random_uuid(),
  workflow_version_id  uuid not null references workflow_version(id) on delete cascade,
  step_ord             int,
  kind                 text not null,
  ord                  int  not null default 0,
  -- Named `statement`, not `text`. `text` is a type name, and `length(text)` inside a check
  -- constraint reads ambiguously enough that it is not worth finding out on a live database.
  statement            text not null default '',
  subject_kind         text,
  subject_ref          text,
  operator             text,
  value                text,
  created_at           timestamptz not null default now(),
  constraint criterion_kind_known check (kind in ('ready','done')),
  -- Mechanical criteria need all four parts or none of them. A half-specified check is one that
  -- silently never evaluates, which reads as satisfied — the exact false green this model exists
  -- to prevent.
  constraint criterion_check_complete check (
    (subject_kind is null and subject_ref is null and operator is null and value is null) or
    (subject_kind is not null and subject_ref is not null and operator is not null and value is not null)
  ),
  -- Judgment criteria must at least say what is being judged.
  constraint criterion_judgment_has_text check (subject_kind is not null or length(statement) > 0)
);

create index if not exists criterion_by_version on criterion (workflow_version_id, kind, step_ord);

-- ── lookup indexes ───────────────────────────────────────────────────────────────────────────
-- Every read is scoped to an org and (usually) an engagement, so that is the leading pair.

create index if not exists workstream_lookup on workstream (org_id, engagement_id, code);
create index if not exists role_lookup       on role       (org_id, engagement_id, code);
create index if not exists workflow_lookup   on workflow   (org_id, engagement_id, code);
create index if not exists phase_lookup      on phase      (org_id, engagement_id, code);
