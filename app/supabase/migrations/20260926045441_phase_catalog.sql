-- phase_catalog.sql — the `phase` table, back, as a display catalog rather than an idea that had
-- no rows.
--
-- Dropped in 20260101003000_drop_unused.sql when it held nothing: "phases still held state...
-- resolved into a display band computed from dependencies, so the table never had a row and never
-- will." That was true of a phase that tries to GATE or COMPUTE readiness. This is not that — the
-- original creation comment already said so ("carries NO state and gates NOTHING") — it is
-- exactly the same shape as `workstream`: a code, a label, an order, and nothing derived. What was
-- missing the first time was a reader. The Plan & sprint page is one: every phase lane's label,
-- left-to-right order, and whether it groups by sprint cycle is data an operator authors here, not
-- a name a component hardcodes.
--
-- WHY NOW, SPECIFICALLY: `workflow.phase_code` and `workflow_run.phase_tag` (20260924200000) both
-- already carry free-text phase values — "New", "Discovery", "Build" today, and per phase_tag's own
-- comment, "discovery/build/hypercare/support... not a fixed [vocabulary]" once the repeating
-- `sprint` workflow ships. Nothing enforced or labelled those values before this; this table is
-- where that catalog finally lives, mirroring `workstream` column for column plus one flag.

create table if not exists phase (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references org(id) on delete cascade,
  engagement_id  text references engagement(id) on delete cascade,
  code           text not null,
  label          text not null,
  ord            int  not null default 0,
  enabled        boolean not null default true,
  -- Does this phase's own lane sub-group by sprint cycle (Cycle 1, Cycle 2, …) rather than by its
  -- workflows directly? A flag, not a name check — `Build` earns this today by having the flag set
  -- on its seed row, not by a component asking `phase === "Build"`. A future phase wanting the same
  -- treatment sets the same flag; the reader never learns a new phase's name to do it.
  cycles         boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique nulls not distinct (org_id, engagement_id, code)
);

create index if not exists phase_lookup on phase (org_id, engagement_id, code);

do $$
begin
  if to_regclass('public.phase') is null then
    raise exception 'phase table was not created';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'phase' and column_name = 'cycles'
  ) then
    raise exception 'phase.cycles was not created';
  end if;
end $$;
