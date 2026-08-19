-- A row has a name a person would use.
--
-- The step carried only `task` — a slug like `propose-kickoff-backlog` — so the queue showed
-- "propose-kickoff-backlog" and, for the row whose step names no task at all, fell back to the
-- WORKFLOW's label: a task called "Basecamp" inside the basecamp run. The phase files always had
-- proper titles ("Shape the kickoff backlog"); there was nowhere to put them.
--
-- `task` stays the slug the agent file is keyed by. `title` is what the human reads. Conflating the
-- two is what made the queue unreadable.

alter table workflow_step add column if not exists title text;

comment on column workflow_step.title is
  'What a person calls this row. `task` remains the agent-file key; this is the label.';
