-- sweep_release_always.sql — a dead claim is ALWAYS released, however many times it has died.
--
-- Two defects in `run_heartbeat.sql`'s release, both found in review before anything depended on it:
--
-- 1. `and run_attempts < 5` in the WHERE clause excluded an exhausted row from the UPDATE entirely.
--    The comment beside it claimed parity with `releaseExecutor`'s exhaustion — but that path still
--    CLEARS `executor` past the ceiling (only the retry scheduling stops). Here the claim itself
--    was left in place: after five stale detections a sixth dead run stayed `executor = 'app'` for
--    ever with nothing left that would ever touch it — the exact stuck-run incident the heartbeat
--    exists to close, delayed by five cycles. The claim is now released unconditionally; only the
--    BACKOFF is gated on the ceiling.
--
-- 2. `heartbeat_at is not null` excluded a claim that never got a heartbeat (an out-of-band write, a
--    future code path that sets `executor` without one) — invisible to the sweep, and invisible to
--    the UI too (`isStale(null)` is false). Judged from `started_at` instead when there is no
--    heartbeat, mirroring `lastSign` in `app/lib/agent/heartbeat-config.ts`. Every non-idle row has
--    a `started_at` (work_task_idle_never_started), and this only looks at `state = 'running'`.
--
-- Releasing past the ceiling only helps if the dispatch loop then leaves the row alone — it treats
-- `next_attempt_at is null` as "due now", so an exhausted row (next_attempt_at null, by design)
-- would have been re-dispatched every tick for ever. Exhausted = run_attempts > 5, the same line
-- `releaseExecutor` draws (MAX_RUN_ATTEMPTS). This also closes the same latent hole on the TS path,
-- whose exhausted rows had the identical shape. A person can still run it by hand, or reset it
-- (`resetStalledRun` zeroes run_attempts).

create or replace function compass_sweep_due_tasks() returns void as $$
declare
  v_url    text := current_setting('app.sweep_url', true);
  v_secret text := current_setting('app.sweep_secret', true);
  v_task   record;
begin
  -- Pure Postgres bookkeeping — needs no public URL, so it runs before the "is this deployed yet"
  -- guard, as in run_heartbeat.sql.
  update work_task
     set executor = null,
         run_attempts = run_attempts + 1,
         next_attempt_at = case
           when run_attempts + 1 > 5 then null
           else now() + (run_attempts + 1) * interval '2 minutes'
         end
   where state = 'running'
     and executor is not null
     and coalesce(heartbeat_at, started_at) < now() - interval '10 minutes';

  if v_url is null or v_secret is null then
    return; -- not configured yet — see run_retry_and_sweep.sql's own header.
  end if;

  for v_task in
    select id from work_task
    where state = 'running' and executor is null
      and run_attempts <= 5
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

-- Self-asserting. The stale-past-the-ceiling and never-had-a-heartbeat rows are the two that used to
-- be left claimed; a fresh claim, and a fresh claim with no heartbeat, must be left alone.
do $$
declare
  v_org uuid := (select id from org limit 1);
  v_eng text := (select id from engagement limit 1);
  v_exhausted uuid := gen_random_uuid();
  v_noheart   uuid := gen_random_uuid();
  v_fresh     uuid := gen_random_uuid();
  v_freshnohb uuid := gen_random_uuid();
  r record;
begin
  insert into work_task (id, org_id, engagement_id, role_code, title, origin, rationale, state,
                         started_at, executor, heartbeat_at, run_attempts)
  values
    (v_exhausted, v_org, v_eng, 'staff-engineer', 'sweep test — exhausted', 'adhoc', 'self-test',
     'running', now() - interval '1 hour', 'app', now() - interval '20 minutes', 5),
    (v_noheart,   v_org, v_eng, 'staff-engineer', 'sweep test — no heartbeat', 'adhoc', 'self-test',
     'running', now() - interval '1 hour', 'app', null, 0),
    (v_fresh,     v_org, v_eng, 'staff-engineer', 'sweep test — fresh', 'adhoc', 'self-test',
     'running', now(), 'app', now(), 0),
    (v_freshnohb, v_org, v_eng, 'staff-engineer', 'sweep test — fresh, no heartbeat', 'adhoc', 'self-test',
     'running', now(), 'app', null, 0);

  perform compass_sweep_due_tasks();

  select executor, run_attempts, next_attempt_at into r from work_task where id = v_exhausted;
  if r.executor is not null then
    raise exception 'sweep: an exhausted stale claim was left claimed';
  end if;
  if r.run_attempts <> 6 or r.next_attempt_at is not null then
    raise exception 'sweep: exhausted row should end at run_attempts 6 with no retry scheduled, got % / %',
      r.run_attempts, r.next_attempt_at;
  end if;

  select executor into r from work_task where id = v_noheart;
  if r.executor is not null then
    raise exception 'sweep: a claim with no heartbeat was never released';
  end if;

  select executor into r from work_task where id = v_fresh;
  if r.executor is distinct from 'app' then
    raise exception 'sweep: released a live claim';
  end if;

  select executor into r from work_task where id = v_freshnohb;
  if r.executor is distinct from 'app' then
    raise exception 'sweep: released a just-started claim that has no heartbeat yet';
  end if;

  delete from work_task where id in (v_exhausted, v_noheart, v_fresh, v_freshnohb);
end $$;
