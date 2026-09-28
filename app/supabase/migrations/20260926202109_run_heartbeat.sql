-- run_heartbeat.sql — tell a live run apart from an abandoned claim.
--
-- The gap `run_retry_and_sweep.sql` left open, on purpose at the time: its own header says the
-- sweep "reads that existing signal" — `state = 'running' and executor is null` — and that is the
-- durable signal for a row nobody ever claimed, or one whose claimant cleanly released it. It is NOT
-- a signal for the row a process was killed out from under: `executor` stays 'app' forever, because
-- nothing left alive ever runs the code that would clear it. That is the exact shape of the task
-- this app's own operator has now hit twice ("Research the ground" stuck at `executor: app` with no
-- process behind it) and both times the only fix was a hand-written PATCH straight to Postgres.
--
-- `heartbeat_at` is the missing half. `runAgent` touches it at claim and periodically while the
-- model call is in flight; a row whose executor is set but whose heartbeat has gone stale is
-- indistinguishable from a genuinely dead run, so it is treated as one — released with the SAME
-- backoff bookkeeping (`run_attempts`/`next_attempt_at`) a normal failure already gets, which is
-- what lets the EXISTING sweep loop below pick it back up. No second retry mechanism.

alter table work_task add column if not exists heartbeat_at timestamptz;

comment on column work_task.heartbeat_at is
  'Touched at claim and periodically while runAgent holds the executor. A claimed row whose '
  'heartbeat has gone stale past HEARTBEAT_STALE_MINUTES is treated as an abandoned run, not a '
  'live one — see compass_sweep_due_tasks below and releaseStale in run.ts.';

-- How long a silent claim gets the benefit of the doubt. Generous relative to an ordinary run (the
-- longest seen in practice is under four minutes) because the cost of calling a live run dead is a
-- SECOND concurrent dispatch racing the first (the claim's `.is("executor", null)` CAS stops that
-- from doing damage, but it still burns a model call); the cost of being too generous is only that
-- an actually-dead row waits a little longer to be noticed. Asymmetric, so the number leans long.
--
-- 10 minutes, matching `HEARTBEAT_STALE_MINUTES` in `app/lib/agent/heartbeat-config.ts` — this file
-- cannot import that constant, so the two are duplicated on purpose. Change both together.
create or replace function compass_sweep_due_tasks() returns void as $$
declare
  v_url    text := current_setting('app.sweep_url', true);
  v_secret text := current_setting('app.sweep_secret', true);
  v_task   record;
begin
  -- Release claims whose heartbeat has gone stale — UNCONDITIONALLY, before the "is this deployed
  -- yet" guard below. This is pure Postgres bookkeeping; it needs no public URL to reach and no
  -- reason to wait for one. The dispatch loop below is the only half that actually needs `v_url`/
  -- `v_secret`, so it is the only half still gated on them.
  --
  -- Same shape `releaseExecutor`'s failure path already writes from TS: bump `run_attempts`, clear
  -- `executor`, back off `next_attempt_at`. Past the same ceiling `releaseExecutor` enforces, stop
  -- bumping the backoff and leave it exhausted rather than retrying forever — `task.run_exhausted`
  -- is emitted by the TS path on a normal failure; this SQL path has no `event` row to write (no
  -- engagement/org context here worth the join), so it is silent past the ceiling on purpose — the
  -- row simply stops being picked up, same as the TS path's own steady state once exhausted.
  update work_task
     set executor = null,
         run_attempts = run_attempts + 1,
         next_attempt_at = case
           when run_attempts + 1 > 5 then null
           else now() + (least(run_attempts + 1, 5) * interval '2 minutes')
         end
   where state = 'running'
     and executor is not null
     and heartbeat_at is not null
     and heartbeat_at < now() - interval '10 minutes'
     and run_attempts < 5;

  if v_url is null or v_secret is null then
    return; -- not configured yet — see run_retry_and_sweep.sql's own header.
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

-- Self-asserting: a stale claim is released with a backoff and re-enters the dispatch loop's own
-- WHERE clause; a fresh one is left alone. Cleaned up regardless of outcome.
do $$
declare
  v_stale_id uuid := gen_random_uuid();
  v_fresh_id uuid := gen_random_uuid();
  v_stale_executor text;
  v_fresh_executor text;
begin
  insert into work_task (
    id, org_id, engagement_id, role_code, title, origin, rationale, state, started_at,
    executor, heartbeat_at, run_attempts
  )
  values
    (v_stale_id, (select id from org limit 1), (select id from engagement limit 1), 'staff-engineer',
     'heartbeat test — stale', 'adhoc', 'heartbeat self-test', 'running', now(),
     'app', now() - interval '20 minutes', 0),
    (v_fresh_id, (select id from org limit 1), (select id from engagement limit 1), 'staff-engineer',
     'heartbeat test — fresh', 'adhoc', 'heartbeat self-test', 'running', now(),
     'app', now(), 0);

  perform compass_sweep_due_tasks();

  select executor into v_stale_executor from work_task where id = v_stale_id;
  select executor into v_fresh_executor from work_task where id = v_fresh_id;

  delete from work_task where id in (v_stale_id, v_fresh_id);

  if v_stale_executor is not null then
    raise exception 'compass_sweep_due_tasks did not release the stale-heartbeat claim';
  end if;
  if v_fresh_executor is distinct from 'app' then
    raise exception 'compass_sweep_due_tasks released a live claim it should have left alone';
  end if;
end $$;
