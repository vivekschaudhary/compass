-- The scaffold record names the repos it creates, in a table this app can read. Until now it was
-- free text, so the fan-out had nothing it could trust to say which repos exist.
--
-- Three changes, together:
--   1. A default template, `scaffold-record`, with a Repositories table: one row per repo, with the
--      key the app uses, a display name, and the framework the generator should run.
--   2. `scaffold-foundation` declares that template and a new output, `scaffold-plan`, which the app
--      reads at approval to create the repos and their tasks. Its drafting tool stays `draft`.
--   3. The output list is widened to accept `scaffold-plan`. The importer's STEP_OUTPUTS moves with it.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_output_known') then
    raise exception 'expected workflow_step_output_known to exist';
  end if;
end $$;

alter table workflow_step drop constraint workflow_step_output_known;
alter table workflow_step add constraint workflow_step_output_known
  check (output is null or output in ('roster', 'backlog', 'sprint', 'code', 'supplied', 'scaffold', 'scaffold-plan'));

insert into document_template (name, title, body)
select 'scaffold-record', 'Scaffold record',
$body$# Scaffold record

## Scope

What is being scaffolded, in a few sentences. Say what is in and what is deliberately out.

## Repositories

Every repo this scaffold creates. One row per repo. `key` is the short handle the app uses, lowercase,
letters, digits and hyphens only. `framework` is one of the generator's frameworks: `nextjs-ts`.

| key | name | framework |
|-----|------|-----------|

## Assumptions

Anything the foundation architecture left open, and what was assumed.
$body$
where not exists (
  select 1 from document_template where name = 'scaffold-record' and org_id is null and engagement_id is null
);

update workflow_step
   set template = 'scaffold-record', output = 'scaffold-plan'
 where task = 'scaffold-foundation';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_output_known'
                   and pg_get_constraintdef(oid) like '%scaffold-plan%') then
    raise exception 'workflow_step_output_known does not accept scaffold-plan';
  end if;
  if not exists (select 1 from document_template where name = 'scaffold-record'
                   and org_id is null and engagement_id is null) then
    raise exception 'the scaffold-record template was not created';
  end if;
end $$;
