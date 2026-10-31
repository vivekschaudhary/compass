-- build_does_not_read_the_scaffold_record.sql — step 1 of `build` stops declaring `scaffold-record`.
--
-- Every read of a build is required (the orchestrator halts on a missing one), so a read has to be
-- one that is right for every repository a build can go into. The scaffold record is not: Compass
-- cannot scaffold an iOS app yet, so the record describes the backend plan and calls the iOS repo
-- "nothing created" while a Swift project exists on `main`. The engineer works inside the checkout
-- and sees what a repository actually is; the architecture documents give the design.
--
-- Add it back once the scaffold workflow produces a record that describes every repository.
--
-- UPDATES THE PUBLISHED ROW IN PLACE, as the other row-level corrections to live workflows have
-- been made while the seed lags the database. Asserts its own effect.

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

  update workflow_step set reads = array_remove(reads, 'scaffold-record')
   where workflow_version_id = v_ver;

  select count(*) into n from workflow_step
   where workflow_version_id = v_ver and 'scaffold-record' = any(reads);
  if n <> 0 then
    raise exception 'expected no build step to read scaffold-record, % still do', n;
  end if;

  select count(*) into n from workflow_step
   where workflow_version_id = v_ver and ord = 1
     and reads = array['stories/{epic}', 'epic/{epic}', 'foundational-architecture',
                       'feature-architecture', 'design-library'];
  if n <> 1 then
    raise exception 'step 1 of build should now read the story, the design, both architecture documents and the design library';
  end if;
end $$;
