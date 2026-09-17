-- v1's tables go with v1.
--
-- The app carried two engines, and the code for the first was deleted in the commit before this
-- one. These sixteen tables were read and written only by that code: v1's backlog (`epic`, `story`,
-- `task`), its runs and jobs (`run`, `job`), its chat (`chat_thread`, `chat_message`,
-- `agent_question`), its spec editor (`spec_file`, `spec_file_version`, `doc_tree_spec`) and its
-- dashboard (`activity`, `metric`, `milestone`, `deliverable`, `change_request`). v2 replaced each:
-- `backlog_item`, `workflow_run`/`work_task`, `turn`/`question`, and `workflow_step`/`criterion` rows.
--
-- Checked before writing this, not assumed:
--   - no `.from()` in app code names any of them after the deletion;
--   - no v2 table holds a foreign key INTO any of them — every FK runs from them to `engagement` or
--     `app_user`, so nothing that stays points at anything that goes;
--   - no view exists, and no function body reads them. Two old migrations mention `job` and `epic`,
--     but as one-time seed-data statements, not as dependencies.
--
-- KEPT, though only v1 read them: `user_role` and `app_user`. They are the grant tables for real
-- identity and `lib/authz.ts` still reads `user_role`; auth will be built on them.
--
-- The names that look alike are not these tables: `work_task` is not `task`, and `lib/data/job.ts`
-- is v2 code, not the `job` table.
--
-- NO `cascade`. Every dependency among these sixteen is inside the set, and one statement drops them
-- together. If anything OUTSIDE the set still depends on one of them, Postgres refuses the whole
-- statement — which is the answer wanted. `cascade` would instead drop that dependent object too,
-- silently, and it would be something that was meant to stay.
--
-- `if exists` because seven of them (`epic`, `story`, `run`, `deliverable`, `change_request`,
-- `chat_thread`, `chat_message`) come from the hand-applied baseline in supabase/schema.sql rather
-- than from a migration, so a database built from migrations alone never had them.

drop table if exists
  activity,
  agent_question,
  change_request,
  chat_message,
  chat_thread,
  deliverable,
  doc_tree_spec,
  epic,
  job,
  metric,
  milestone,
  run,
  spec_file,
  spec_file_version,
  story,
  task;

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
--
-- A migration in this repo has reported "Finished" and changed nothing. So: none of the sixteen may
-- remain, and the two kept on purpose must still be here.
do $$
declare
  survivors text;
  missing   text;
begin
  select string_agg(relname, ', ' order by relname) into survivors
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and relname in ('activity','agent_question','change_request','chat_message','chat_thread',
                     'deliverable','doc_tree_spec','epic','job','metric','milestone','run',
                     'spec_file','spec_file_version','story','task');
  if survivors is not null then
    raise exception 'v1 tables still present after the drop: %', survivors;
  end if;

  select string_agg(t, ', ' order by t) into missing
    from unnest(array['user_role','app_user','work_task','workflow_run','document','engagement']) t
   where not exists (
     select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname = t);
  if missing is not null then
    raise exception 'tables that must survive are missing: %', missing;
  end if;
end $$;
