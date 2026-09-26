-- ticket_brief_enabled.sql — `ticket_brief` needs `enabled` after all.
--
-- Left off the table two minutes ago on the theory that nothing lists or retires these rows, only
-- reads one at a time by code. Wrong the moment `readExisting`'s generic `list()` helper — the same
-- one `workstream` and `phase` already go through — was pointed at it: `list()` unconditionally
-- filters `eq("enabled", true)`, and a table missing the column fails the read outright rather than
-- degrading. Adding it here rather than reworking `list()` to special-case one table keeps every
-- catalog `list()` touches the same shape, which is the point of it being generic.

alter table ticket_brief add column if not exists enabled boolean not null default true;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'ticket_brief' and column_name = 'enabled'
  ) then
    raise exception 'ticket_brief.enabled was not created';
  end if;
end $$;
