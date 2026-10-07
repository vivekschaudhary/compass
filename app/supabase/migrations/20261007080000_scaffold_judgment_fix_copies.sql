-- The first attempt (20261007073000) moved the two judgment criteria off `execute-scaffold`, but
-- only in `scaffold-repo`'s OWN workflow version — the template. The inline fan-out
-- (`materializeInlinePerSubject`) copies a nested workflow's criteria into the CALLING run's own
-- version (`copyCriteriaIfMissing`, migration `task_subject.sql`'s companion code), so a live
-- `execute-scaffold` task actually reads criteria from its PARENT run's version
-- (`foundation-architecture`'s), not from `scaffold-repo`'s. The first migration never touched
-- those copies, so a real run was still stuck.
--
-- This one is NOT scoped by which workflow owns the version — it matches on the step names
-- themselves, `execute-scaffold` and `approve-repo-scaffold`, since those are specific to this
-- fan-out and used nowhere else. That reaches the template AND every run that has already copied
-- its own criteria, present or future.

update criterion
   set step_task = 'approve-repo-scaffold'
 where step_task = 'execute-scaffold'
   and kind = 'done'
   and subject_kind is null;

do $$
declare
  v_remaining int;
begin
  select count(*) into v_remaining
    from criterion where step_task = 'execute-scaffold' and kind = 'done' and subject_kind is null;
  if v_remaining <> 0 then
    raise exception 'execute-scaffold still carries % judgment criteria, in some workflow version', v_remaining;
  end if;
end $$;
