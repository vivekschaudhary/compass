-- epic_design_gates.sql — tech design and stories wait for the epic's design, and read it.
--
-- The order per epic is: visual design -> technical design -> stories -> build. Until now nothing
-- enforced or even read the first link: `design/{epic}` was filed and no workflow looked at it.
--
-- Two things, on the published version of each workflow, edited in place (the way the other
-- per-epic workflows were made — pins are recorded when a task STARTS, so tasks already running keep
-- the reads they started with):
--
--   1. the step READS `design/{epic}`, so the agent is shown the screens when it works;
--   2. a READY criterion, `design/{epic}` is published, so the task cannot START before the design
--      exists. `startTask` re-measures ready criteria and refuses while one is unmet, and `{epic}`
--      resolves from the task's own run subject, so each epic waits for its own design.
--
-- An epic with no UI is not special-cased here. The designer files a short `design/{epic}` that says
-- so and why (the supplied row `file-epic-design`), the product manager accepts it, and the gate is
-- the same one. Nothing is skipped, and the decision is on record with a second person's name on it.
--
-- NOT CHANGED, deliberately: `build`. Every read on a build is required and a missing one refuses
-- the build, so adding `design/{epic}` there would block each epic that has no design filed yet.
--
-- `refine-stories` already gates its first step on `epic/{epic}` being published; that is untouched.
--
-- Epics already on the board that have no design cannot start tech design or stories until a
-- `design/{epic}` is filed for them. That is the intent of the gate, and the reason it is worth
-- reading before applying.
--
-- It asserts its own effect.

do $$
declare
  v_ver   uuid;
  v_code  text;
  v_task  text;
  v_ord   int;
  n       int;
begin
  for v_code, v_task in
    select * from (values ('tech-design', 'draft-epic-tech-design'),
                          ('refine-stories', 'draft-epic-stories')) t(code, task)
  loop
    select wv.id into v_ver
      from workflow_version wv join workflow w on w.id = wv.workflow_id
     where w.code = v_code and w.engagement_id is null and wv.status = 'published'
     order by wv.version desc limit 1;
    if v_ver is null then
      raise exception '% has no published version', v_code;
    end if;

    -- 1. the read
    update workflow_step
       set reads = array_append(reads, 'design/{epic}')
     where workflow_version_id = v_ver and task = v_task
       and not ('design/{epic}' = any(reads));

    -- 2. the gate
    if not exists (select 1 from criterion
                    where workflow_version_id = v_ver and kind = 'ready'
                      and subject_ref = 'design/{epic}' and step_task = v_task) then
      select coalesce(max(ord), -1) + 1 into v_ord from criterion where workflow_version_id = v_ver;
      insert into criterion (workflow_version_id, kind, ord, statement, subject_kind, subject_ref,
                             operator, value, step_task, generated)
      values (v_ver, 'ready', v_ord,
              'The epic''s design is filed and published (design/{epic}) — for an epic with no UI, a note saying so.',
              'document', 'design/{epic}', 'status', 'published', v_task, false);
    end if;

    -- It asserts its own effect.
    select count(*) into n from workflow_step
     where workflow_version_id = v_ver and task = v_task and 'design/{epic}' = any(reads);
    if n <> 1 then
      raise exception '% step % should read design/{epic}', v_code, v_task;
    end if;

    select count(*) into n from criterion
     where workflow_version_id = v_ver and kind = 'ready'
       and subject_ref = 'design/{epic}' and value = 'published' and step_task = v_task;
    if n <> 1 then
      raise exception '% should have exactly one design/{epic} ready criterion on %, got %', v_code, v_task, n;
    end if;
  end loop;
end $$;
