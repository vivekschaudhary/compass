-- ticket_brief.sql — the ground rules for what a ticket says, as data instead of a constant.
--
-- `ticket-body.ts`'s `TYPE_BRIEF` is a one-line "what this type is FOR" per Jira issue type, baked
-- into the file and identical for every org. That was fine while every ticket's body came from the
-- same one place (`mirrorPhase`'s epic + stories); it stops being fine the moment a second path
-- (`mirrorNested`'s sub-tasks) needs its OWN ground rules — a sub-task is about EXECUTION (what
-- this role is doing right now, with what inputs, and what closes it), never a restatement of the
-- story it sits under — and the moment a client-specific org wants different wording for any level,
-- same as it already can for a phase's label or a role's capabilities.
--
-- THREE LEVELS, not four Jira types. Compass's own hierarchy is epic (the phase/bet as a whole) →
-- story (one deliverable within it) → subtask (one step inside that deliverable's own workflow).
-- `Bug` stays out of this table on purpose — nothing live composes a Bug body today (checked: no
-- caller passes that issueType), and triage/fix is a different flow with its own ground rules when
-- it exists, not a fourth row squeezed into a hierarchy it does not belong to.
--
-- Same two-tier precedence every other catalog in this app resolves with (engagement override,
-- org default) — see `phase`, `workstream`. No `label`/`ord`/`enabled`: nothing lists these or
-- orders them: they are read one at a time, by code, never displayed as a set.

create table if not exists ticket_brief (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references org(id) on delete cascade,
  engagement_id  text references engagement(id) on delete cascade,
  code           text not null,
  brief          text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique nulls not distinct (org_id, engagement_id, code)
);

create index if not exists ticket_brief_lookup on ticket_brief (org_id, engagement_id, code);

do $$
begin
  if to_regclass('public.ticket_brief') is null then
    raise exception 'ticket_brief table was not created';
  end if;
end $$;
