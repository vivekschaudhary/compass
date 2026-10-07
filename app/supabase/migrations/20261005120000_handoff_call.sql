-- A handoff to something outside the app's process: today, the generator. One row per call, written
-- BEFORE the spawn with the request, and closed AFTER with the result. The result is the record a
-- gate reads, so nothing downstream has to ask GitHub or the process what happened.
--
-- Why a row and not a log file: the gate for `ci is green` needs the checks the generator ran, and
-- a gate reads the database. The log file (`log_ref`) is for a person diagnosing a run, not for a
-- verdict.
--
-- A `shipped` row must carry a pull request, and a row that is not `running` must carry a result.
-- Both are enforced here, not only in the app, so a bad write fails loudly rather than reading as
-- success.

create table if not exists handoff_call (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references org(id) on delete cascade,
  engagement_id   text references engagement(id) on delete cascade,
  work_task_id    uuid not null references work_task(id) on delete cascade,
  kind            text not null,
  status          text not null default 'running',
  request         jsonb not null,
  result          jsonb,
  pr_url          text,
  created_at      timestamptz not null default now(),
  closed_at       timestamptz,
  constraint handoff_call_kind_known check (kind in ('generate')),
  constraint handoff_call_status_known check (
    status in ('running', 'shipped', 'checks_failed', 'generator_failed', 'refused')
  ),
  constraint handoff_call_shipped_has_pr check (status <> 'shipped' or pr_url is not null),
  constraint handoff_call_closed_has_result check (
    status = 'running' or (result is not null and closed_at is not null)
  )
);

create index if not exists handoff_call_task_idx on handoff_call (work_task_id, created_at desc);
