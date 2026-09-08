-- 055_engagement_org.sql — an engagement says which organisation it belongs to.
--
-- 023 set the convention: `org_id + engagement_id` on every table, denormalised on purpose so
-- row-level security can key off a column on the row it protects. `engagement` was the exception,
-- and it is the one row where it matters most — it is the PARENT. Until now org -> engagement was
-- an unenforced convention held up entirely by children agreeing with each other, and nothing
-- stopped two tasks under one engagement from claiming different orgs. An isolation rule that
-- cannot be stated on the parent is not an isolation rule.
--
-- `on delete restrict`, NOT cascade. Every other org_id in this schema cascades, and 023 says why:
-- end-to-end testing means deleting engagements often. That reasoning does not reach here. Deleting
-- an organisation would take every engagement, every run, every task and every document with it, in
-- one statement, with nothing to review. Restrict makes it a two-step act where the first step
-- fails loudly and names what is in the way.
--
-- THE BACKFILL RESOLVES, IT DOES NOT GUESS. Three cases, in order:
--
--   1. The engagement has children (tasks, runs, documents) that all name ONE org. That org is the
--      answer, proven by the data.
--   2. Its children disagree. There is no answer, and the migration HALTS naming the engagements —
--      picking `min(org_id)` here would silently move an engagement between tenants, which is the
--      worst thing this schema can do.
--   3. It has no children at all — a freshly created engagement, or v1's seeded `acme`. Resolvable
--      only when exactly one org exists, because then there is no other candidate. With several,
--      it halts.
--
-- The empty-org case is handled before any of it: an engagement exists and no organisation does, so
-- the one the whole application already defaults to — `default`, the code `onboard.ts` and
-- `documents.ts` both fall back to — is created. That is the same lazy creation `store.ts` already
-- does on import, not a value invented for this migration. It runs ONLY when there is an engagement
-- needing an owner, so a genuinely empty database gains nothing.
--
-- `set not null` IS THE ASSERTION. If any row is still unresolved the statement fails and the
-- migration stops — a backfill that quietly left nulls behind is the false-green this repo keeps
-- paying for.

alter table engagement add column if not exists org_id uuid references org(id) on delete restrict;

do $$
declare
  v_orgs   int;
  v_stuck  text;
begin
  -- Nothing to do on a re-run: every row already resolved.
  if not exists (select 1 from engagement where org_id is null) then
    return;
  end if;

  -- An engagement with no organisation to belong to. See the header.
  select count(*) into v_orgs from org;
  if v_orgs = 0 then
    insert into org (code, name) values ('default', 'default');
    raise notice 'created org ''default'' — engagements existed with no organisation at all';
    v_orgs := 1;
  end if;

  -- 1 · resolved by the children that agree.
  update engagement e
     set org_id = sub.org_id
    from (
      -- `min(uuid)` does not exist in Postgres, and the `having` below already guarantees there
      -- is exactly one distinct value — so take it out of the array rather than aggregate it.
      select engagement_id, (array_agg(distinct org_id))[1] as org_id
        from (
          select engagement_id, org_id from work_task    where engagement_id is not null
          union all
          select engagement_id, org_id from workflow_run where engagement_id is not null
          union all
          select engagement_id, org_id from document
        ) u
       group by engagement_id
      having count(distinct org_id) = 1
    ) sub
   where sub.engagement_id = e.id
     and e.org_id is null;

  -- 2 · children that disagree. Halt, naming them.
  select string_agg(engagement_id, ', ') into v_stuck
    from (
      select engagement_id
        from (
          select engagement_id, org_id from work_task    where engagement_id is not null
          union all
          select engagement_id, org_id from workflow_run where engagement_id is not null
          union all
          select engagement_id, org_id from document
        ) u
       group by engagement_id
      having count(distinct org_id) > 1
    ) amb;
  if v_stuck is not null then
    raise exception 'these engagements have rows under more than one org and cannot be resolved: % '
                    '— work out which organisation each belongs to before running this', v_stuck;
  end if;

  -- 3 · no children. Only answerable when there is a single org.
  if exists (select 1 from engagement where org_id is null) then
    if v_orgs = 1 then
      update engagement set org_id = (select id from org) where org_id is null;
    else
      select string_agg(id, ', ') into v_stuck from engagement where org_id is null;
      raise exception 'these engagements have no rows under any org and % organisations exist, so '
                      'their owner cannot be derived: % — set engagement.org_id by hand, then re-run',
                      v_orgs, v_stuck;
    end if;
  end if;
end $$;

-- The real assertion: a backfill that left anything behind stops here rather than shipping.
alter table engagement alter column org_id set not null;

comment on column engagement.org_id is
  'The organisation this engagement or product belongs to. Completes the org_id + engagement_id '
  'pair 023 put on every child table — this is the parent, so an isolation rule can finally be '
  'stated at the top of the tree. `on delete restrict`, unlike every other org_id here: dropping an '
  'organisation must not silently take every engagement beneath it.';

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'engagement'::regclass and attname = 'org_id'
       and attnotnull and not attisdropped) then
    raise exception 'engagement.org_id is missing or nullable — the parent still cannot state its tenant';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'engagement'::regclass and contype = 'f' and confrelid = 'org'::regclass
       and confdeltype = 'r') then
    raise exception 'engagement.org_id is not restrict-on-delete — deleting an org would take its engagements';
  end if;
  -- A child that disagrees with its parent is now possible to detect. It must not already exist.
  if exists (
    select 1 from work_task t join engagement e on e.id = t.engagement_id
     where t.org_id <> e.org_id) then
    raise exception 'work_task rows name a different org from their engagement — resolve before relying on this column';
  end if;
end $$;
