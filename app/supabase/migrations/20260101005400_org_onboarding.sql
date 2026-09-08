-- 054_org_onboarding.sql — `org` becomes a record of an organisation that ONBOARDED, not just a key.
--
-- The table exists (023) and is `id, code, name`. That was enough to be a tenant key — every row in
-- the system carries `org_id` so row-level security can be switched on without a reshape — but it
-- is not a record of anything. Nothing says who this organisation is, who at Compass owns the
-- relationship, or whether they are actually live. `store.ts` creates one LAZILY on first seed
-- import with `name = code`, so today an org can come into existence as a side effect of an import
-- and nobody would know whether it represents a customer or a test.
--
-- EXTENDED RATHER THAN REPLACED. A second table — `organization` beside `org` — would give the
-- system two answers to "who is the tenant", and `org_id` on nineteen tables points at this one.
-- v2 forking the spine was a defect, not a design.
--
-- FOUR COLUMNS, and each earns its place:
--
--   `status`         An organisation being KNOWN and an organisation being LIVE are different
--                    facts, and the lazy creation above means the first happens without anyone
--                    deciding. Default 'onboarding' so an org created as a side effect can never
--                    read as live.
--
--   `onboarded_at`   The moment, not just the state. Paired with `status` by a check constraint
--                    below, because two columns for one fact drift the day someone writes one and
--                    not the other — and "active since never" is the exact shape of a status that
--                    looks fine and means nothing.
--
--   `owner`          A NAMED HUMAN who owns this relationship. This product's whole claim is that
--                    acceptance is attributable; an organisation nobody owns is the status theatre
--                    it replaces. Nullable only because existing rows have no answer — the intake
--                    path must supply one.
--
--   `domain`         The email domain. It is how a person arriving at sign-in is matched to an org
--                    without an admin typing anything, and it is the one identifier an organisation
--                    has that is neither a slug we invented nor a display name that changes.
--
-- LOWERCASE, ENFORCED. `Acme.com` and `acme.com` are the same organisation and Postgres will not
-- say so. A check constraint rather than a lowering trigger: silently rewriting what someone typed
-- hides a caller that is not normalising, and the caller is what needs fixing.
--
-- WHAT IS NOT HERE: plan, seats, billing, contract dates. None of it has a consumer yet, and a
-- column with no reader is a column that goes stale unnoticed.

alter table org add column if not exists status       text not null default 'onboarding';
alter table org add column if not exists onboarded_at timestamptz;
alter table org add column if not exists owner        text;
alter table org add column if not exists domain       text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'org_status_known') then
    alter table org add constraint org_status_known
      check (status in ('onboarding', 'active', 'suspended'));
  end if;

  -- The pairing. 'active' without a moment is a claim the data cannot support; 'onboarding' WITH
  -- one means somebody went live and the status was never moved. Both are caught here rather than
  -- discovered later in a report that quietly counted the wrong orgs.
  if not exists (select 1 from pg_constraint where conname = 'org_onboarded_at_matches_status') then
    alter table org add constraint org_onboarded_at_matches_status
      check (
        (status = 'onboarding' and onboarded_at is null)
        or (status in ('active', 'suspended') and onboarded_at is not null)
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'org_domain_lowercase') then
    alter table org add constraint org_domain_lowercase
      check (domain is null or domain = lower(domain));
  end if;
end $$;

-- One organisation per domain. Nullable, so orgs without one do not collide with each other — a
-- plain unique constraint would allow that too, but the partial index says the intent out loud.
create unique index if not exists org_by_domain on org (domain) where domain is not null;

comment on column org.status is
  'onboarding — known but not live, and the default, because store.ts creates an org as a side '
  'effect of a seed import and that must never read as a customer. active — live. suspended — was '
  'live and is not.';
comment on column org.onboarded_at is
  'When onboarding completed. Constrained to agree with status: active/suspended require it, '
  'onboarding forbids it.';
comment on column org.owner is
  'The named human who owns this relationship. Nullable only for rows that predate this column.';
comment on column org.domain is
  'The organisation''s email domain, lowercase — how a person at sign-in is matched to an org. '
  'Enforced lowercase rather than lowered on write, so a caller that does not normalise fails '
  'loudly instead of being silently corrected.';

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
declare
  c text;
begin
  foreach c in array array['status', 'onboarded_at', 'owner', 'domain'] loop
    if not exists (
      select 1 from pg_attribute
       where attrelid = 'org'::regclass and attname = c and not attisdropped) then
      raise exception 'org.% was not created', c;
    end if;
  end loop;
  foreach c in array array['org_status_known', 'org_onboarded_at_matches_status', 'org_domain_lowercase'] loop
    if not exists (select 1 from pg_constraint where conname = c) then
      raise exception '% is missing — the column it guards can hold anything', c;
    end if;
  end loop;
  if to_regclass('public.org_by_domain') is null then
    raise exception 'org_by_domain was not created — two orgs could claim one domain';
  end if;
  -- Every existing row must satisfy the new pairing. A constraint added over data that already
  -- violates it would have failed above; this says so explicitly rather than assuming.
  if exists (select 1 from org where status = 'active' and onboarded_at is null) then
    raise exception 'an org is active with no onboarded_at — the constraint did not hold';
  end if;
end $$;
