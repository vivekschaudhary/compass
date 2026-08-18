-- 018_sprint0_epic_kind.sql — a stable way to find an engagement's Sprint 0 epic.
--
-- `3c08bde8` made the Jira key the epic's id ("one identity" — the board and the app agree), which
-- is right. But two call sites still looked the epic up by the OLD local id `<engagement>-S0`:
-- lib/program.ts (the DM's jobs queue) and api/product-brief (the ticket the workflow closes). Both
-- therefore failed EXACTLY when Jira worked — the Sprint 0 backlog was created in Jira and then
-- invisible in the app, and /create-product-brief reported "no Sprint 0 foundation ticket found".
--
-- Marking the epic instead of encoding identity in its id: the id stays whatever the tracker says,
-- and finding it never depends on that.

alter table epic add column if not exists kind text;   -- null | 'sprint-0'

-- Backfill: Sprint 0 epics are the only ones intake creates with phase 'Kickoff' at ord 0.
update epic set kind = 'sprint-0'
 where kind is null and phase = 'Kickoff' and ord = 0;

create index if not exists epic_kind_eng on epic(engagement_id, kind);
