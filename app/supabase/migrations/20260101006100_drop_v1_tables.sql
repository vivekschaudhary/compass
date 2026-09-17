-- v1's tables go with v1 — the ones nothing still reads.
--
-- The app carried two engines, and the code for the first was deleted. These fourteen tables are
-- read by no remaining source: v1's runs and jobs (`run`, `job`, `task`), its backlog (`epic`,
-- `story`), its chat (`chat_thread`, `chat_message`, `agent_question`), its workspace scaffolding
-- (`doc_tree_spec`) and its dashboard (`activity`, `metric`, `milestone`, `deliverable`,
-- `change_request`). v2 replaced them with `workflow_run` / `work_task`, `backlog_item`,
-- `turn` / `question`, and `event`.
--
-- THE RULE: a table is dropped only if no remaining source file queries it. Not "only v1 code read
-- it" — that was this migration's first draft, and it was wrong. It sorted callers by the DIRECTORY
-- they sit in, and root-level `lib/*.ts` looked like v1 although several of those modules are v2's.
-- It would have dropped `spec_file`, which `lib/specs.ts` resolveSpec reads on every agent run: the
-- read would have errored, returned null, and resolution fallen back to the framework file on disk,
-- ignoring the override without a word. The draft's check also passed while checking nothing — a
-- zsh `for t in $T` does not word-split, so the loop ran once over the whole list as one string.
--
-- Three tables were held back by that rule and are dropped now that their readers are gone:
--   story, epic      read by `lib/jira.ts` jiraForStory, which found an engagement's Jira credentials
--                    through them. Both were empty, so v2 builds silently used env credentials.
--                    Replaced by jiraForEngagement, which reads the engagement directly.
--   doc_tree_spec    read only by `lib/doctree.ts` seedDocTreeSpec / getEngagementDocTree /
--                    scaffoldDocs, which nothing called after v1. Removed.
--
-- KEPT:
--   spec_file          read on every agent run for agent-file overrides (above).
--   spec_file_version  its edit history.
--   user_role, app_user  the grant tables for real identity; `lib/authz.ts` reads `user_role`.
--
-- Checked, by a script that first proves it finds a known table, against app code, scripts, and the
-- Python orchestrator: none of the fourteen is queried. No v2 table holds a foreign key into any of
-- them; every FK among them points within the set or out to `engagement`. No view exists and no
-- function body reads them.
--
-- `activity` holds 197 rows of v1's event log; v2 writes its own to `event`. The rest are empty.
--
-- NO `cascade`. Anything outside the set that still depends on one of these makes Postgres refuse
-- the whole statement, which is the answer wanted. `cascade` would take that dependent object too,
-- silently.
--
-- `if exists` so a re-run is a no-op rather than an error. Seven of these (`epic`, `story`, `run`,
-- `deliverable`, `change_request`, `chat_thread`, `chat_message`) come from the hand-applied
-- baseline in supabase/schema.sql, not from a migration — as does `engagement` in the survivor check
-- below. Every working database has that baseline: the earliest migrations alter `engagement`.

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
  story,
  task;

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
--
-- A migration in this repo has reported "Finished" and changed nothing. So: none of the fourteen may
-- remain, and every table kept on purpose must still be here.
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
                     'story','task');
  if survivors is not null then
    raise exception 'v1 tables still present after the drop: %', survivors;
  end if;

  select string_agg(t, ', ' order by t) into missing
    from unnest(array['spec_file','spec_file_version','user_role','app_user',
                      'work_task','workflow_run','document','engagement']) t
   where not exists (
     select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname = t);
  if missing is not null then
    raise exception 'tables that must survive are missing: %', missing;
  end if;
end $$;
