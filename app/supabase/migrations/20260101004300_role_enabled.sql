-- 043_role_enabled.sql — a role can be retired, and retiring is not deleting.
--
-- The importer upserts and never removes. A role dropped from the seed stayed in the database
-- forever, and a role RENAMED became two rows: `pm` and `product-manager`, both live, both
-- offerable. That is how the roster ended up with seventeen entries describing fifteen roles.
--
-- Deleting is the wrong repair. `work_task.role_code` is plain text rather than a foreign key, so a
-- delete breaks nothing referentially and quietly breaks `buildContext`, which resolves a task's
-- agent file THROUGH the role row and — correctly — reports a missing agent rather than substituting
-- one. Every historical task naming a retired role would start failing loudly for no reason, long
-- after anyone remembers why.
--
-- So: disabled, like `workflow.enabled` already is. History keeps resolving, nothing dispatches it,
-- and the retirement is a visible fact rather than a row that vanished.

alter table role add column if not exists enabled boolean not null default true;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'role' and column_name = 'enabled'
  ) then
    raise exception 'role.enabled was not created';
  end if;
end $$;
