-- 049_engagement_kind.sql — one table serves a services engagement and a product, and says which.
--
-- `engagement` is already the product level: it owns the connector config (jira_project,
-- confluence_space, atlassian_*), the document tree, and every run and task beneath it. What it
-- also carries is a commercial half — client, sow, pricing, budget, months — which a product
-- company has no answer for. Today those simply sit null, and a null is indistinguishable from
-- "nobody filled it in yet". That is the shape rule 11 names: absence standing in for a fact.
--
-- A COLUMN, NOT A RENAME. The obvious move is `engagement` -> `product`, and this repo has already
-- priced that: `engagement_id` is a text foreign key on twelve tables and appears in every module
-- under app/lib, and "a rename is a writing job" is in AGENTS.md because blind substitution
-- produced "The epics is published". The physical table stays; `kind` is what the UI reads to
-- decide whether to ask for a client and an SOW at all, and what a reviewer reads to know that an
-- empty `pricing` is correct rather than missing.
--
-- A SEPARATE TABLE WAS REJECTED. `product` beside `engagement` would fork the spine: every child
-- would need two nullable parents and every query a union. v2 forking the spine was a defect once
-- already.
--
-- DEFAULT 'engagement', deliberately. Every row that exists today is one, and a default that
-- changed the meaning of existing data would be a silent rewrite of history.

alter table engagement add column if not exists kind text not null default 'engagement';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'engagement_kind_known') then
    alter table engagement add constraint engagement_kind_known
      check (kind in ('engagement', 'product'));
  end if;
end $$;

comment on column engagement.kind is
  'What this row is. `engagement` — a services delivery for a client, so client/sow/pricing/budget '
  'are expected. `product` — a product company''s own product, where those columns are expected '
  'null and their emptiness is correct rather than missing. Everything below this row — features, '
  'runs, tasks, documents, backlog — is identical either way.';

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
-- `add column if not exists` finding a same-named column from an older migration and skipping is
-- how this repo got a migration that reported "Finished" and changed nothing.
do $$
begin
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'engagement'::regclass and attname = 'kind' and not attisdropped) then
    raise exception 'engagement.kind was not created';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'engagement_kind_known') then
    raise exception 'engagement_kind_known is missing — any string would be a valid kind';
  end if;
end $$;
