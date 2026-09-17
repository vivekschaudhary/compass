-- v1's tables go with v1 — the ones nothing still reads.
--
-- The app carried two engines, and the code for the first was deleted in an earlier commit. These
-- eleven tables were read and written only by that code: its runs and jobs (`run`, `job`, `task`),
-- its chat (`chat_thread`, `chat_message`, `agent_question`), and its dashboard (`activity`,
-- `metric`, `milestone`, `deliverable`, `change_request`). v2 replaced them with `workflow_run` /
-- `work_task`, `turn` / `question`, and `event`.
--
-- THE RULE: a table is dropped only if no remaining source file queries it. Not "only v1 code read
-- it" — that was the first draft of this migration, and it was wrong. It sorted callers by the
-- DIRECTORY they sit in, and root-level `lib/*.ts` looked like v1. Some of those modules are v2's.
-- So these were on the first list and are NOT dropped:
--
--   spec_file          `lib/specs.ts` resolveSpec, which `lib/agent/context.ts` calls on EVERY agent
--                      run to load the role's agent file with its org/engagement override. Dropped,
--                      the read errors, returns null, and resolution silently falls back to the
--                      framework file on disk — an override ignored, and nothing says so.
--   spec_file_version  the edit history of spec_file (88 rows). History of a live table is not v1's.
--   story, epic        `lib/jira.ts` jiraForStory, called from `lib/agent/run.ts` on every code build
--                      to find the engagement's Jira credentials. Both tables are empty today, so that
--                      lookup already falls back to env credentials — a v2 bug to fix in its own
--                      change, after which these two can go.
--   doc_tree_spec      `lib/doctree.ts` seedDocTreeSpec / getEngagementDocTree. Unreached from v2, but
--                      still source; dropped when that dead code is removed, not before.
--
-- The first draft's check also passed while checking nothing: a zsh `for t in $T` does not
-- word-split, so the loop ran once over the whole list as a single string, matched no file, and
-- printed a clean result. The list below was checked by a script, per table.
--
-- Also KEPT: `user_role` and `app_user`, the grant tables for real identity; `lib/authz.ts` reads
-- `user_role`.
--
-- Checked: no v2 table holds a foreign key into any of the eleven. `task` references `story` and
-- `metric` references `epic`, both kept — a child dropping takes its own FK with it and leaves the
-- parent untouched. `chat_message` references `chat_thread` and `run`, both in this statement. No
-- view exists and no function body reads them.
--
-- `activity` holds 197 rows of v1's event log. v2 writes its own to `event`.
--
-- NO `cascade`. Anything outside the set that still depends on one of these makes Postgres refuse
-- the whole statement, which is the answer wanted. `cascade` would take that dependent object too,
-- silently.
--
-- `if exists` so a re-run is a no-op rather than an error. Five of these (`run`, `deliverable`,
-- `change_request`, `chat_thread`, `chat_message`) come from the hand-applied baseline in
-- supabase/schema.sql, not from a migration — as do `story`, `epic` and `engagement` in the
-- survivor check below. Every working database has that baseline: the earliest migrations alter
-- `engagement` and would fail without it.

drop table if exists
  activity,
  agent_question,
  change_request,
  chat_message,
  chat_thread,
  deliverable,
  job,
  metric,
  milestone,
  run,
  task;

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
--
-- A migration in this repo has reported "Finished" and changed nothing. So: none of the eleven may
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
                     'deliverable','job','metric','milestone','run','task');
  if survivors is not null then
    raise exception 'v1 tables still present after the drop: %', survivors;
  end if;

  select string_agg(t, ', ' order by t) into missing
    from unnest(array['spec_file','spec_file_version','story','epic','doc_tree_spec',
                      'user_role','app_user','work_task','workflow_run','document','engagement']) t
   where not exists (
     select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname = t);
  if missing is not null then
    raise exception 'tables that must survive are missing: %', missing;
  end if;
end $$;
