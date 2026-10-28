-- build_reads_the_story_and_its_design.sql — the rows of `build` declare what they read.
--
-- Step 1 declared no reads, so the agent that starts a build was told "this task declares no input
-- documents" and, knowing only the story's title, asked the person to paste the technical design.
-- Steps 2-5 read `{subject}`, which for a build is the STORY's ticket (`CT-359`) — a document nobody
-- files, so each of them would have been reported missing.
--
-- A story's text and its design are filed per EPIC, so they are named by the epic: `{epic}` on a
-- run about a story resolves to the epic the story is under (see `resolvePath`). The first step also
-- gets the engagement-wide pages the orchestrator itself loads for a story build; the later steps
-- need the story and its design only.
--
-- UPDATES THE PUBLISHED ROWS IN PLACE, the way the other row-level corrections to live workflows
-- have been made while the seed lags the database. Asserts its own effect, and refuses to report
-- success if `build` has no published version to correct.

do $$
declare
  v_ver uuid;
  n int;
begin
  select wv.id into v_ver
    from workflow_version wv join workflow w on w.id = wv.workflow_id
   where w.code = 'build' and wv.status = 'published'
   order by wv.version desc limit 1;
  if v_ver is null then
    raise exception 'no published version of the build workflow to correct';
  end if;

  update workflow_step set reads = array[
      'stories/{epic}', 'epic/{epic}', 'foundational-architecture', 'feature-architecture',
      'design-library', 'scaffold-record']
   where workflow_version_id = v_ver and ord = 1;

  update workflow_step set reads = array['stories/{epic}', 'epic/{epic}']
   where workflow_version_id = v_ver and ord between 2 and 5;

  select count(*) into n from workflow_step
   where workflow_version_id = v_ver and 'epic/{epic}' = any(reads) and not ('{subject}' = any(reads));
  if n <> 5 then
    raise exception 'expected all 5 build steps to read the story and its design, got %', n;
  end if;
end $$;
