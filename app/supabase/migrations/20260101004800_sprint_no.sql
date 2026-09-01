-- 048_sprint_no.sql — which sprint a planning task planned, and nothing else about the sprint.
--
-- THE SPRINT LIVES IN JIRA. A committed story carries the label `sprint-3` and the label of the
-- role that owns it, and it carries a real assignee. Which stories are in a sprint, who owns them
-- and who they are assigned to is asked of the tracker every time it is needed — never read back
-- out of Compass. A `sprint` table with a `sprint_commitment` child was drafted and thrown away for
-- exactly the reason `backlog_item`'s header gives for existing: that table earns its place because
-- the epics do not exist yet when the agent drafts them, and `ticket_key is null` is a pending
-- queue. Sprint planning has no such gap — the issues already exist with keys, and committing one
-- is a change TO an issue. A local copy of that would be a second truth, wrong the first time
-- somebody moved a ticket on the board.
--
-- So one column, and it is a number rather than a copy. It is here for the one fact Jira cannot be
-- asked for: JQL cannot wildcard the labels field (`labels ~ "sprint-*"` is unsupported) and
-- `GET /rest/api/3/label` is instance-wide rather than project-scoped, so Jira can answer "does
-- sprint-3 exist?" and not "which sprint labels exist?". The next number has nowhere else to come
-- from.
--
-- It earns its place a second time as the idempotency hinge. Approving the same planning task twice
-- without it labels the stories `sprint-3` and then `sprint-4`, leaving them in two sprints at
-- once — and because the label writes are additive, nothing would ever report that as a failure.
--
-- The rejected alternative was probing `labels = "sprint-N"` upward until a query came back empty.
-- A sprint that committed no stories, or one whose issues were later deleted, reads as unused under
-- that scheme and the next plan silently overwrites it. Silent overwrite of a real sprint is worse
-- than a column.

alter table work_task add column if not exists sprint_no int;

comment on column work_task.sprint_no is
  'Which sprint this planning task planned. Jira holds the sprint itself (label sprint-N); this is '
  'only the number, because JQL cannot enumerate labels so the next one has nowhere else to come '
  'from. Also what makes re-approving the same task idempotent rather than renumbering. Null on '
  'every task that is not a sprint plan.';

-- Allocation reads this per engagement, and only over tasks that have one.
create index if not exists work_task_sprint_no
  on work_task (engagement_id, sprint_no) where sprint_no is not null;

-- ── a phase that runs more than once ─────────────────────────────────────────────────────────
--
-- `sprint` repeats; every other phase runs once. Until now `initiatePhase` returned ANY existing
-- run of a workflow regardless of state, so once sprint 1 closed there was no way to open sprint 2
-- — the second attempt silently handed back the finished run and the queue looked like the sprint
-- had simply stopped.
--
-- A COLUMN RATHER THAN A LITERAL. The obvious fix is `code === 'sprint'` in the one place that
-- needs it, and this repo has already paid for that shape once: `consistency-check.py` hardcoded
-- "N of 18 workflows" and became the stale claim it existed to police. A workflow says whether it
-- repeats; nothing else has to know which one it is.
--
-- Default FALSE, deliberately. A phase wrongly marked repeatable offers to start work that is
-- already done, so absence has to mean "runs once".
alter table workflow add column if not exists repeatable boolean not null default false;

comment on column workflow.repeatable is
  'This phase may be opened again once its previous run has closed — `sprint` does, the rest do '
  'not. Read by phasesFor to decide whether a closed run means "finished" or "ready to go again".';

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
-- This repo has had a migration report "Finished" and change nothing, because an `if not exists`
-- found a same-named object from an older migration and skipped. A named object that must exist
-- after this runs is checked rather than trusted.
do $$
begin
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'work_task'::regclass and attname = 'sprint_no' and not attisdropped) then
    raise exception 'work_task.sprint_no was not created';
  end if;
  if to_regclass('public.work_task_sprint_no') is null then
    raise exception 'work_task_sprint_no index was not created — sprint allocation would seq-scan';
  end if;
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'workflow'::regclass and attname = 'repeatable' and not attisdropped) then
    raise exception 'workflow.repeatable was not created — no phase could ever run twice';
  end if;
end $$;
