-- A nested workflow declares its interface, and the row that nests it is gated on it.
--
-- A `kind: workflow` step opens a child run and closes when that run closes. What the child needed
-- on the way in, and what it owed on the way out, was written by hand as criteria on the nesting
-- row — restating what the child's own last step already gated. Predictably it drifted: three of
-- nine nesting rows (`draft-epics`, `draft-feature-architecture`, `design-epics-tech`) carried no
-- criteria at all and closed on whatever the child happened to do.
--
-- So the contract moves to the child, once: `workflow.inputs` and `workflow.outputs`, imported from
-- two new columns in compass/seed/workflows.csv. The importer turns them into the nesting row's
-- ready and done criteria, and refuses an output no step of that workflow produces.
--
-- `criterion.generated` marks a row the importer derived rather than one a person wrote in
-- criteria.csv. A re-import replaces its own rows and never touches an authored one, and the task
-- page can say where a gate came from.
--
-- Columns, not a separate table: a workflow has exactly one interface, the values are short, and
-- every read of them already reads the workflow row.

alter table workflow add column if not exists inputs  text[] not null default '{}';
alter table workflow add column if not exists outputs text[] not null default '{}';

alter table criterion add column if not exists generated boolean not null default false;

-- Existing rows are authored by definition: everything in the table today came from criteria.csv,
-- before generation existed. The default above already says so; this is here to state that the
-- backfill is deliberate and empty rather than forgotten.

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
--
-- `add column if not exists` is exactly the shape that has reported "Finished" while doing nothing
-- in this repo, so the result is checked rather than trusted.
do $$
declare missing text;
begin
  select string_agg(w.c, ', ') into missing
    from (values ('workflow','inputs'), ('workflow','outputs'), ('criterion','generated')) as w(t, c)
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = w.t and column_name = w.c);
  if missing is not null then
    raise exception 'nested contract columns missing after migration: %', missing;
  end if;
end $$;
