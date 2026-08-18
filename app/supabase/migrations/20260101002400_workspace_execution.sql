-- 024_workspace_execution.sql — runs, tasks, and the event log.
--
-- This is the half where history is written, so the guarantees are different from 023. Config is
-- idempotent and can be re-imported; an event cannot be written twice and cannot be reconstructed
-- afterwards. Everything below is shaped around that.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE EVENT IS WRITTEN BY A TRIGGER, NOT BY THE APPLICATION.
--
-- The original plan was a `start_task()` routine that updated state and inserted the event in one
-- transaction, and to call it "the only door". It is not: anything holding the service-role key
-- can UPDATE the row directly, and then state has moved with no record of it. Which is precisely
-- the false green this model exists to prevent — a board that says done with nothing behind it.
--
-- So the trigger does it. State cannot change without an event, because the database writes the
-- event. A direct UPDATE still produces history; it just produces history with a NULL actor,
-- which is a visible anomaly rather than a silent one.
--
-- The routines below remain, because they set the actor and enforce the legal transitions. They
-- are the front door. The trigger is the reason there is no back door.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- ── preflight ───────────────────────────────────────────────────────────────────────────────
-- `create table if not exists` on a name that is already taken does NOTHING, silently, and the
-- next statement then fails against the wrong shape with an error that names a column rather than
-- the collision. That is how this migration failed first time: v1 already has a `task` table, so
-- ours was skipped and the index on engagement_id broke.
--
-- Every table below carries org_id. A name that already exists WITHOUT one is therefore not ours,
-- and the migration should refuse rather than half-apply.

do $$
declare
  taken text;
begin
  select string_agg(t.tablename, ', ') into taken
  from pg_tables t
  where t.schemaname = 'public'
    and t.tablename in ('event','workflow_run','work_task','task_input','measurement','turn','question')
    and not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t.tablename and c.column_name = 'org_id'
    );

  if taken is not null then
    raise exception
      'Name collision: % already exist(s) and are not ours (no org_id). Rename the v2 table rather than half-applying.', taken;
  end if;
end $$;

-- ── event ────────────────────────────────────────────────────────────────────────────────────
-- Append-only. No update, no delete: a revoked approval is a second event, never an edited one.
--
-- CASCADE for now, deliberately — end-to-end testing means deleting engagements often. AT LAUNCH
-- this becomes `on delete restrict`: deleting an engagement must not silently erase the record of
-- what happened in it, and making deletion a two-step is the feature rather than the friction.

create table if not exists event (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid references org(id) on delete cascade,
  engagement_id   text references engagement(id) on delete cascade,
  actor_kind      text not null default 'system',
  actor_role_code text,
  actor_user_id   text,
  subject_type    text not null,
  subject_id      uuid,
  verb            text not null,
  payload         jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now(),
  constraint event_actor_kind_known check (actor_kind in ('human','agent','system'))
);

create index if not exists event_by_subject    on event (subject_type, subject_id, occurred_at);
create index if not exists event_by_engagement on event (engagement_id, occurred_at desc);
create index if not exists event_by_verb       on event (verb, occurred_at desc);

-- ── workflow_run ─────────────────────────────────────────────────────────────────────────────
-- One execution, pinned to the version it followed. `state` and `closed_at` are maintained by the
-- trigger below, never computed at read: Supabase Realtime subscribes to tables, and a push needs
-- a moment rather than an answer-when-asked.

create table if not exists workflow_run (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references org(id) on delete cascade,
  engagement_id        text references engagement(id) on delete cascade,
  workflow_id          uuid not null references workflow(id) on delete cascade,
  workflow_version_id  uuid not null references workflow_version(id),
  owner_role_code      text,
  ticket_key           text,                  -- the STORY, when the workflow has more than one step
  state                text not null default 'open',
  opened_at            timestamptz not null default now(),
  opened_by            text,
  closed_at            timestamptz,
  constraint workflow_run_state_known check (state in ('open','closed','abandoned'))
);

create index if not exists workflow_run_by_engagement on workflow_run (engagement_id, state);

-- ── work_task ───────────────────────────────────────────────────────────────────────────────
-- NAMED `work_task` BECAUSE `task` IS TAKEN. v1 already has a `task` table — the checklist items
-- under a story — and `create table if not exists` on a colliding name does nothing SILENTLY,
-- which is how this first ran: the table was skipped and the index on engagement_id then failed
-- against v1's shape. At cutover, when v1's table goes, this becomes `task`. The child tables
-- keep `task_id` for that reason.
--
-- The queue card. One per step reached — NOT one per step defined: the graph branches, and
-- creating every step's task up front would make every triage look half-abandoned.
--
-- NOTHING STARTS ITSELF. A task is created `idle` with started_at NULL, and only a click moves
-- it. A task with a NULL started_at has never run, and that is checkable rather than asserted.
--
-- Ad-hoc work has no run and no step, and gets its ticket when it STARTS rather than when it is
-- written down — so the board carries planned work because it was planned, and unplanned work
-- only once it actually happens.

create table if not exists work_task (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references org(id) on delete cascade,
  engagement_id     text references engagement(id) on delete cascade,
  workflow_run_id   uuid references workflow_run(id) on delete cascade,
  workflow_step_id  uuid references workflow_step(id),
  role_code         text not null,
  workstream_code   text,
  kind              text not null default 'agent',
  origin            text not null default 'defined',
  rationale         text,                     -- why the defined process did not cover it
  title             text not null,
  subtitle          text not null default '',
  state             text not null default 'idle',
  executor          text,                     -- app | orchestrator
  ticket_key        text,
  sprint_key        text,
  started_at        timestamptz,
  started_by        text,
  closed_at         timestamptz,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint work_task_kind_known  check (kind  in ('agent','hitl','approval','code')),
  constraint work_task_origin_known check (origin in ('defined','adhoc')),
  constraint work_task_state_known check (state in ('idle','running','awaiting','hitl','closed','abandoned')),
  -- Idle means never run. If started_at is set, the state must have moved past idle, and vice
  -- versa — otherwise "nothing has run yet" is a claim the data cannot support.
  constraint work_task_idle_never_started check (
    (state = 'idle' and started_at is null) or (state <> 'idle' and started_at is not null)
  ),
  -- Ad-hoc work belongs to no run and no step; defined work belongs to both.
  constraint work_task_origin_matches_parent check (
    (origin = 'defined' and workflow_run_id is not null and workflow_step_id is not null) or
    (origin = 'adhoc'   and workflow_run_id is null     and workflow_step_id is null)
  ),
  -- An ad-hoc task must say why it was needed. That rationale is the evidence a practice reads
  -- when deciding what its next workflow version should contain.
  constraint work_task_adhoc_has_rationale check (origin = 'defined' or length(coalesce(rationale,'')) > 0)
);

create index if not exists work_task_queue on work_task (engagement_id, role_code, state);
create index if not exists work_task_by_run on work_task (workflow_run_id);

-- ── task_input ───────────────────────────────────────────────────────────────────────────────
-- What the agent reads, PINNED when the task starts. This is the card's "reads a · b · c" line
-- and the first pane of the job view.
--
-- Paths and versions are text for now: the document tables land in 025. Pinning a version the
-- moment the task starts is the point — a citation that resolves to whatever the file says today
-- is not provenance.

create table if not exists task_input (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references work_task(id) on delete cascade,
  document_path  text not null,
  document_version text,
  pinned_at      timestamptz not null default now(),
  unique (task_id, document_path)
);

-- ── measurement ──────────────────────────────────────────────────────────────────────────────
-- One row per criterion per task: is it satisfied, WHEN was that checked, and what said so.
--
-- `measured_at` and `source` are not optional, and that is the whole point. A measurement with no
-- timestamp is an assertion wearing a tick — it looks identical to evidence and is not.

create table if not exists measurement (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references work_task(id) on delete cascade,
  criterion_id  uuid not null references criterion(id) on delete cascade,
  satisfied     boolean not null,
  measured_at   timestamptz not null default now(),
  source        text not null,               -- jira | github | compass | human
  detail        text,
  unique (task_id, criterion_id)
);

-- ── turn / question — the conversation ───────────────────────────────────────────────────────

create table if not exists turn (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references work_task(id) on delete cascade,
  ord              int  not null,
  author_kind      text not null,
  author_role_code text,
  author_user_id   text,
  body             text not null,
  created_at       timestamptz not null default now(),
  unique (task_id, ord),
  constraint turn_author_kind_known check (author_kind in ('human','agent','system'))
);

-- The agent asks what it cannot infer, and WAITS. There is no 'declined' state: an agent that may
-- proceed on its own guess publishes a document resting on a choice no person made.
create table if not exists question (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references work_task(id) on delete cascade,
  turn_id      uuid references turn(id) on delete set null,
  prompt       text not null,
  type         text not null default 'text',
  options      jsonb,
  answer       text,
  answered_by  text,
  answered_at  timestamptz,
  state        text not null default 'open',
  created_at   timestamptz not null default now(),
  constraint question_type_known  check (type  in ('choice','number','text')),
  constraint question_state_known check (state in ('open','answered')),
  constraint question_answered_has_answer check (
    (state = 'open' and answer is null) or (state = 'answered' and answer is not null)
  )
);

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- THE TRIGGERS — history, written by the database
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- Who is acting, read from a session setting the routines below set. A direct UPDATE that does
-- not set it produces an event with a NULL actor, which is a visible anomaly rather than a
-- missing record.
create or replace function compass_actor_kind() returns text as $$
  select coalesce(nullif(current_setting('compass.actor_kind', true), ''), 'system');
$$ language sql stable;

create or replace function compass_actor_id() returns text as $$
  select nullif(current_setting('compass.actor', true), '');
$$ language sql stable;

create or replace function compass_actor_role() returns text as $$
  select nullif(current_setting('compass.actor_role', true), '');
$$ language sql stable;

-- ── every task state change becomes an event ─────────────────────────────────────────────────

create or replace function task_write_event() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into event (org_id, engagement_id, actor_kind, actor_role_code, actor_user_id,
                       subject_type, subject_id, verb, payload)
    values (new.org_id, new.engagement_id, compass_actor_kind(), compass_actor_role(), compass_actor_id(),
            'task', new.id, 'task.created',
            jsonb_build_object('role', new.role_code, 'origin', new.origin, 'title', new.title));
    return new;
  end if;

  if new.state is distinct from old.state then
    insert into event (org_id, engagement_id, actor_kind, actor_role_code, actor_user_id,
                       subject_type, subject_id, verb, payload)
    values (new.org_id, new.engagement_id, compass_actor_kind(), compass_actor_role(), compass_actor_id(),
            'task', new.id, 'task.' || new.state,
            jsonb_build_object('from', old.state, 'to', new.state, 'role', new.role_code));
  end if;

  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists task_event on work_task;
create trigger task_event before insert or update on work_task
  for each row execute function task_write_event();

-- ── a run closes when its last task closes ───────────────────────────────────────────────────
-- Derived at write time, not read time: "the workflow just closed" is a moment someone may need
-- pushing to them, and a view has no moments.

create or replace function run_close_when_tasks_done() returns trigger as $$
declare
  open_tasks int;
  run_state  text;
begin
  if new.workflow_run_id is null then return new; end if;
  if new.state is not distinct from old.state then return new; end if;

  select state into run_state from workflow_run where id = new.workflow_run_id;
  if run_state <> 'open' then return new; end if;

  select count(*) into open_tasks
  from work_task where workflow_run_id = new.workflow_run_id and state not in ('closed','abandoned');

  if open_tasks = 0 then
    update workflow_run set state = 'closed', closed_at = now() where id = new.workflow_run_id;

    insert into event (org_id, engagement_id, actor_kind, actor_role_code, actor_user_id,
                       subject_type, subject_id, verb, payload)
    values (new.org_id, new.engagement_id, compass_actor_kind(), compass_actor_role(), compass_actor_id(),
            'workflow_run', new.workflow_run_id, 'workflow.closed', '{}'::jsonb);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists run_closes on work_task;
create trigger run_closes after update on work_task
  for each row execute function run_close_when_tasks_done();

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- THE ROUTINES — the front door. They set the actor and enforce legal transitions.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

create or replace function compass_set_actor(p_actor text, p_role text, p_kind text default 'human')
returns void as $$
begin
  perform set_config('compass.actor', coalesce(p_actor, ''), true);
  perform set_config('compass.actor_role', coalesce(p_role, ''), true);
  perform set_config('compass.actor_kind', coalesce(p_kind, 'human'), true);
end;
$$ language plpgsql;

-- Open a run and materialise its FIRST task only. Later steps become tasks as the graph reaches
-- them, because the graph branches.
create or replace function open_workflow_run(
  p_org_id uuid, p_engagement_id text, p_workflow_code text,
  p_actor text default null, p_actor_role text default null
) returns uuid as $$
declare
  v_wf      workflow%rowtype;
  v_ver     workflow_version%rowtype;
  v_step    workflow_step%rowtype;
  v_run_id  uuid;
begin
  perform compass_set_actor(p_actor, p_actor_role, 'human');

  select * into v_wf from workflow
   where org_id = p_org_id and code = p_workflow_code
     and (engagement_id = p_engagement_id or engagement_id is null)
   order by engagement_id nulls last limit 1;          -- engagement override wins over org default
  if not found then
    raise exception 'No workflow % for this org. Import it before opening a run.', p_workflow_code;
  end if;

  select * into v_ver from workflow_version
   where workflow_id = v_wf.id and status = 'published';
  if not found then
    raise exception 'Workflow % has no published version.', p_workflow_code;
  end if;

  insert into workflow_run (org_id, engagement_id, workflow_id, workflow_version_id,
                            owner_role_code, opened_by)
  values (p_org_id, p_engagement_id, v_wf.id, v_ver.id, v_wf.owner_role_code, p_actor)
  returning id into v_run_id;

  insert into event (org_id, engagement_id, actor_kind, actor_role_code, actor_user_id,
                     subject_type, subject_id, verb, payload)
  values (p_org_id, p_engagement_id, 'human', p_actor_role, p_actor,
          'workflow_run', v_run_id, 'workflow.opened',
          jsonb_build_object('workflow', p_workflow_code, 'version', v_ver.version));

  select * into v_step from workflow_step
   where workflow_version_id = v_ver.id and conditional is null
   order by ord limit 1;
  if found then
    insert into work_task (org_id, engagement_id, workflow_run_id, workflow_step_id,
                      role_code, kind, title, created_by)
    values (p_org_id, p_engagement_id, v_run_id, v_step.id,
            v_step.role_code, case when v_step.kind = 'hitl' then 'hitl' else 'agent' end,
            v_wf.label, p_actor);
  end if;

  return v_run_id;
end;
$$ language plpgsql;

-- Nothing starts itself. This is what a click calls.
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
    -- Refuse rather than silently no-op: a second click that quietly does nothing looks identical
    -- to a first click that worked.
    raise exception 'Task % is already %, not idle. Nothing to start.', p_task_id, v_state;
  end if;

  update work_task
     set state = 'running', started_at = now(), started_by = p_actor
   where id = p_task_id;
end;
$$ language plpgsql;
