-- 044_audit_columns.sql — every table says when it was written, when it changed, and by whom.
--
-- Before this, 42 tables carried three different conventions: a `created_at`/`updated_at` pair on
-- roughly half, a domain-specific name on some (`event.occurred_at`, `workflow_run.opened_at`,
-- `measurement.measured_at`), and nothing at all on eleven — almost exactly the pre-migration set
-- from `supabase/schema.sql`. `member` was in that group, so the roster held no record of when
-- anyone joined an engagement.
--
-- TWO RULES SHAPE WHAT FOLLOWS.
--
-- 1. A COLUMN THAT NEVER MOVES IS WORSE THAN NO COLUMN. There was no generic trigger in this repo:
--    every `updated_at` was `default now()` and advanced only where a code path remembered to write
--    `updated_at = now()`. `workflow`, `role` and `workstream` move because the importer writes
--    them; `org` never has. Adding eleven more such columns would have added eleven more fields
--    that look like audit data and silently lie — the false-green shape rule 11 names. So the
--    trigger comes first and the columns hang off it, not the other way round.
--
-- 2. TWO COLUMNS FOR ONE FACT IS DRIFT WAITING TO HAPPEN. Where a table already names the moment it
--    was created — `event.occurred_at`, `workflow_run.opened_at`, `measurement.measured_at`,
--    `user_role.granted_at`, `spec_file_version.saved_at`, `task_input.pinned_at` — no `created_at`
--    is added beside it. A second column meaning the same instant is one more thing to keep in step,
--    and this repo has already been bitten by a diff that omitted a field and reported "unchanged".
--    The same goes for `*_by`: `workflow_run.opened_by` IS its creator.
--
-- The ACTOR comes from the same session-local setting the event spine already uses —
-- `compass_set_actor` / `compass_actor_id()`. Nothing new is invented, so a write that goes through
-- an RPC attributes to the person, and one that does not attributes to 'system' rather than
-- pretending to know.
--
-- This does NOT replace the `event` table. `event` records WHAT HAPPENED — a verb, a subject, a
-- payload, in order. These columns record the state of a ROW. A row tells you it changed; the event
-- log tells you why.

-- ── the shared trigger ───────────────────────────────────────────────────────────────────────

create or replace function touch_audit_columns() returns trigger as $$
declare
  v_actor text := coalesce(compass_actor_id(), 'system');
  v_has_updated_at boolean;
  v_has_updated_by boolean;
  v_has_created_by boolean;
begin
  -- Which audit columns THIS table actually has. The trigger is attached to tables with differing
  -- shapes, and assigning to a column that does not exist raises. Asking the catalogue keeps one
  -- function serving all of them instead of forty near-identical ones.
  select
    bool_or(attname = 'updated_at'),
    bool_or(attname = 'updated_by'),
    bool_or(attname = 'created_by')
    into v_has_updated_at, v_has_updated_by, v_has_created_by
    from pg_attribute
   where attrelid = tg_relid and attnum > 0 and not attisdropped;

  if tg_op = 'INSERT' then
    -- Only when the caller did not set it. `open_workflow_run` and `file_document` already pass a
    -- real actor into `created_by`, and overwriting that with the session default would replace
    -- better information with worse.
    if v_has_created_by then
      new := jsonb_populate_record(new, jsonb_build_object(
        'created_by', coalesce(to_jsonb(new) ->> 'created_by', v_actor)));
    end if;
    if v_has_updated_at then
      new := jsonb_populate_record(new, jsonb_build_object('updated_at', now()));
    end if;
    if v_has_updated_by then
      new := jsonb_populate_record(new, jsonb_build_object(
        'updated_by', coalesce(to_jsonb(new) ->> 'updated_by', v_actor)));
    end if;
    return new;
  end if;

  -- UPDATE. Unconditional: the row was written, so it changed, and a caller that also set
  -- `updated_at` by hand does not get to report a different time from the one the write happened.
  if v_has_updated_at then
    new := jsonb_populate_record(new, jsonb_build_object('updated_at', now()));
  end if;
  if v_has_updated_by then
    new := jsonb_populate_record(new, jsonb_build_object('updated_by', v_actor));
  end if;
  return new;
end;
$$ language plpgsql;

-- ── add the columns, then attach the trigger, over every table in the public schema ──────────
--
-- Driven off the catalogue rather than a hand-written list. A list would be stale the first time a
-- migration adds a table, and this repo has already had a checker carry the literal it was policing.
do $$
declare
  r record;
  -- Tables whose creation moment already has a name. Adding `created_at` beside these would be a
  -- second column for one fact; `updated_at` still applies, because those rows can be amended.
  v_has_own_created text[] := array[
    'event', 'workflow_run', 'measurement', 'user_role', 'task_input',
    'spec_doc_version', 'spec_file_version'
  ];
  -- Same, for authorship.
  v_has_own_author text[] := array['workflow_run', 'user_role', 'spec_doc_version', 'spec_file_version'];
begin
  for r in
    select c.relname as t
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  loop
    if not (r.t = any (v_has_own_created)) then
      execute format('alter table %I add column if not exists created_at timestamptz not null default now()', r.t);
      if not (r.t = any (v_has_own_author)) then
        execute format('alter table %I add column if not exists created_by text', r.t);
      end if;
    end if;

    execute format('alter table %I add column if not exists updated_at timestamptz not null default now()', r.t);
    if not (r.t = any (v_has_own_author)) then
      execute format('alter table %I add column if not exists updated_by text', r.t);
    end if;

    execute format('drop trigger if exists touch_audit on %I', r.t);
    execute format(
      'create trigger touch_audit before insert or update on %I for each row execute function touch_audit_columns()',
      r.t);
  end loop;
end $$;

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
--
-- Not decoration. A migration in this repo has reported "Finished" and changed nothing, because an
-- `if not exists` found a same-named object from an older migration and skipped. Every `add column
-- if not exists` above can do exactly that, so the result is checked rather than trusted.
do $$
declare
  v_missing text;
  v_untriggered text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'updated_at' and not a.attisdropped);
  if v_missing is not null then
    raise exception 'updated_at is missing on: %', v_missing;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into v_untriggered
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (
       select 1 from pg_trigger tg
        where tg.tgrelid = c.oid and tg.tgname = 'touch_audit' and not tg.tgisinternal);
  if v_untriggered is not null then
    raise exception 'touch_audit is not attached to: % — updated_at would never move there', v_untriggered;
  end if;
end $$;
