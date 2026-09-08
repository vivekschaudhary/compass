-- 056_member_org.sql — a person can belong to the ORGANISATION, not only to an engagement.
--
-- `member` is what puts a person in a role, and it has only ever named an engagement. That makes
-- some roles impossible to express. The PMO Analyst is the clearest case: `roles.csv` titles it
-- "Configures the org and its engagements" and it now owns the `setup` phase — the phase that
-- brings an engagement into being. Someone has to hold that role BEFORE the first engagement
-- exists, and until now there was nowhere to put them. An org with no engagements had no people.
--
-- ONE COLUMN, because `engagement_id` is already nullable. The shape was reachable all along; what
-- was missing was the other half of the pair 023 put on every other table, and a rule saying what a
-- null engagement MEANS.
--
-- `engagement_id is null` MEANS "this person is the org's, on every engagement in it". That is the
-- same two-tier shape `role` and `spec_file` already use — a row with an engagement is that
-- engagement's, a row without is the org's default — and the reads resolve it the same way,
-- `order by engagement_id nulls last limit 1`. A third convention for one idea would be the drift
-- this repo keeps paying for.
--
-- THE PARTIAL UNIQUE INDEX IS THE POINT, not decoration. Without it "the org's PMO analyst" is a
-- query that can return two rows, and every caller then has to decide which — differently. One
-- holder per role per org at org level; a second is a refusal at the write, where it can be fixed,
-- rather than an ambiguity at every read.
--
-- Engagement-level rows are deliberately NOT covered by it. Two people can share a role on one
-- engagement — a pair of engineers is normal — and only the org-level default has to be singular.

alter table member add column if not exists org_id uuid references org(id) on delete cascade;

-- ── backfill, then assert ────────────────────────────────────────────────────────────────────
-- Every existing row names an engagement, and 055 gave the engagement its org. So this is a
-- resolution, not a guess: there is exactly one answer per row and it is already written down.
update member m
   set org_id = e.org_id
  from engagement e
 where e.id = m.engagement_id
   and m.org_id is null;

do $$
declare
  v_stuck text;
begin
  -- A row that could not be resolved. None can exist today — every member names an engagement and
  -- every engagement names an org after 055 — so this is the assertion that says so out loud
  -- rather than letting `set not null` fail with a message that names no row.
  select string_agg(coalesce(id, '(no id)'), ', ') into v_stuck
    from member where org_id is null;
  if v_stuck is not null then
    raise exception 'these member rows have no org and none could be derived: % — set member.org_id '
                    'by hand, then re-run', v_stuck;
  end if;
end $$;

alter table member alter column org_id set not null;

-- One holder of a role per org, at org level. See the header for why engagement-level is exempt.
create unique index if not exists member_org_role
  on member (org_id, role) where engagement_id is null;

-- The lookup the fallback does: this org's default holders.
create index if not exists member_org_defaults
  on member (org_id, role) where engagement_id is null;

-- ── a member's engagement must belong to a member's org ──────────────────────────────────────
-- The cross-tenant guard 051 put on workflow_run, in the one other place two tenancy columns sit
-- on one row. Without it a member could name engagement A and org B, and every read that trusts
-- either column would be wrong about the other.
--
-- A composite foreign key needs a unique key of exactly that shape on the parent. `engagement.id`
-- is already the primary key, so `(id, org_id)` is unique for free — the constraint exists to be
-- referenced, not to constrain anything new.
--
-- MATCH SIMPLE does the right thing here for once: an org-level member has a null engagement_id,
-- so the composite key is not checked at all, which is exactly the row this migration exists to
-- allow. The other column cannot be null — org_id is NOT NULL above — so there is no hole to close
-- the way 051 needed a check constraint.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'engagement_id_org_key') then
    alter table engagement add constraint engagement_id_org_key unique (id, org_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'member_engagement_same_org') then
    alter table member add constraint member_engagement_same_org
      foreign key (engagement_id, org_id) references engagement (id, org_id) on delete cascade;
  end if;
end $$;

-- The pre-existing single-column FK on engagement_id is left in place. It is now redundant with the
-- composite one, and dropping a named constraint that something else may depend on is how this repo
-- got a migration that reported "Finished" and changed nothing. Redundant and correct beats tidy.

comment on column member.org_id is
  'The organisation this person belongs to. Always set. With engagement_id, the row is that '
  'engagement''s; without, the row is the org''s default and applies to every engagement in it — '
  'the same two-tier shape role and spec_file use, resolved `engagement_id nulls last`.';

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'member'::regclass and attname = 'org_id'
       and attnotnull and not attisdropped) then
    raise exception 'member.org_id is missing or nullable — a person could belong to no org';
  end if;
  if to_regclass('public.member_org_role') is null then
    raise exception 'member_org_role is missing — "the org''s holder of this role" could return two rows';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'member_engagement_same_org') then
    raise exception 'member_engagement_same_org is missing — a member could name another org''s engagement';
  end if;
  -- The rule the index encodes, checked against the data rather than assumed from the DDL.
  if exists (
    select 1 from member where engagement_id is null
     group by org_id, role having count(*) > 1) then
    raise exception 'an org already has two default holders of one role — the index did not hold';
  end if;
end $$;
