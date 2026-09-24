-- run_retry_and_sweep.sql — a stuck run gets retried, not lost.
--
-- The gap this closes: the only thing that ever dispatches the model is a browser, calling
-- `POST /api/agent/run`. Close the tab, lose the network, or background the browser before that
-- request lands and `work_task` is left at `state = 'running'`, `executor = null` — and nothing
-- ever picks it back up. `start_task()` and `recordAnswers` both leave a row in exactly this shape
-- and trust the client to finish the job.
--
-- NO NEW OUTBOX TABLE. `work_task.state`/`executor` are already columns maintained on write, not
-- computed at read time — the comment on `workflow_run` in 024_workspace_execution.sql already says
-- why: "Realtime subscribes to tables, and a push needs a moment rather than an answer-when-asked."
-- A row sitting at running/executor:null already IS the durable "this needs a run" signal. This
-- migration adds a periodic SWEEP that reads that existing signal, rather than a second mechanism
-- that would have to be kept in sync with it — and the `event` table was checked and rejected as a
-- foundation for this: it is explicitly fire-and-forget (see events.ts), with no claim state and no
-- retry/backoff columns of its own.
--
-- `run_attempts`/`next_attempt_at` and the bookkeeping in `run.ts`'s `releaseExecutor` give the
-- backoff; `for update skip locked` in the sweep query gives safe concurrency and ordering without a
-- second locking scheme; the existing `executor` claim in `runAgent` (added alongside this) means a
-- sweep tick racing a person's own click is already safe — the sweep only ever calls the SAME
-- `runAgent` everything else uses. No second engine.

-- ── retry bookkeeping on work_task ──────────────────────────────────────────────────────────────

alter table work_task add column if not exists run_attempts int not null default 0;
alter table work_task add column if not exists next_attempt_at timestamptz;

comment on column work_task.run_attempts is
  'How many times the SWEEP (not a person) has dispatched a run for this row since it last made progress.';
comment on column work_task.next_attempt_at is
  'When the sweep may next touch this row. Null means eligible now. Pushed out exponentially by releaseExecutor on failure.';

-- A fresh human-initiated start is not a retry. Reset inside the routine, same transaction as the
-- state flip, for the same reason every other write in this function is atomic with it.
create or replace function start_task(
  p_task_id uuid, p_actor text, p_actor_role text default null
) returns void as $$
declare
  v_state text;
begin
  perform compass_set_actor(p_actor, p_actor_role, 'human');

  select state into v_state from work_task where id = p_task_id for update;
  if not found then
    raise exception 'No such task %', p_task_id;
  end if;
  if v_state <> 'idle' then
    raise exception 'Task % is already %, not idle. Nothing to start.', p_task_id, v_state;
  end if;

  update work_task
     set state = 'running', started_at = now(), started_by = p_actor,
         run_attempts = 0, next_attempt_at = null
   where id = p_task_id;
end;
$$ language plpgsql;

-- ── the sweep ────────────────────────────────────────────────────────────────────────────────────
-- `pg_cron` wakes on a schedule; `pg_net` makes the HTTP call. Both are standard Supabase-managed
-- extensions — nothing bespoke.
--
-- The sweep can only reach a PUBLICLY REACHABLE url — pg_net runs inside Supabase's hosted Postgres
-- and cannot reach a laptop's localhost. It is scheduled here regardless (each tick is a harmless,
-- idempotent no-op against zero due rows until deployment exists), but it will not actually fire
-- anything until two settings are configured on the database, once the app has a public URL:
--
--   alter database postgres set app.sweep_url    = 'https://<deployed-app>/api/agent/sweep';
--   alter database postgres set app.sweep_secret  = '<a long random shared secret>';
--
-- (the sweep route checks the same secret — see app/api/agent/sweep/route.ts.) Until those are set,
-- `current_setting` returns null, `pg_net.http_post` is called with a null url, and every tick fails
-- visibly in `net._http_response` rather than silently doing nothing — a stopped clock is at least
-- checkable, which is what a cron job that quietly never ran would not be.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function compass_sweep_due_tasks() returns void as $$
declare
  v_url    text := current_setting('app.sweep_url', true);
  v_secret text := current_setting('app.sweep_secret', true);
  v_task   record;
begin
  if v_url is null or v_secret is null then
    return; -- not configured yet — see the header comment above.
  end if;

  for v_task in
    select id from work_task
    where state = 'running' and executor is null
      and (next_attempt_at is null or next_attempt_at <= now())
    order by coalesce(next_attempt_at, started_at) asc
    limit 20
    for update skip locked
  loop
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('content-type', 'application/json', 'x-compass-sweep-secret', v_secret),
      body := jsonb_build_object('taskId', v_task.id)
    );
  end loop;
end;
$$ language plpgsql;

select cron.schedule(
  'compass-run-sweep',
  '* * * * *', -- every minute
  $$select compass_sweep_due_tasks();$$
) where not exists (select 1 from cron.job where jobname = 'compass-run-sweep');

-- ── Supabase Realtime ────────────────────────────────────────────────────────────────────────────
-- Nothing enabled this before: `[realtime]` in config.toml is only the default CLI scaffold value,
-- and no prior migration ever granted a table to the publication. Grant the three tables the task
-- page reads live: the row's own state, the conversation, and its open questions.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'work_task'
  ) then
    alter publication supabase_realtime add table work_task;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'turn'
  ) then
    alter publication supabase_realtime add table turn;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'question'
  ) then
    alter publication supabase_realtime add table question;
  end if;
end $$;
