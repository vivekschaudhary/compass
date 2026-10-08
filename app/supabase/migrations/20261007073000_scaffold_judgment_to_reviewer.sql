-- `execute-scaffold`'s two judgment criteria ("writes the right files", "matches the accepted
-- plan") sat on the AUTHOR's own row, with nothing for a human to judge them against — the row's
-- deliverable is a pull request, not a document, so its approve panel never renders (`draftOf`
-- requires a filed document) and the row can never reach `closed`. `depends_on` requires exactly
-- that state before `approve-repo-scaffold` may even start (042_depends_on.sql), so the repo
-- scaffold workflow deadlocked after a successful run: shipped, unreviewable, blocking its own
-- reviewer forever.
--
-- Every other row in this app keeps judgment on the REVIEWER, not the author — the author's row
-- carries no judgment criteria of its own. This moves the two judgment criteria from
-- `execute-scaffold` onto `approve-repo-scaffold`, where the principal engineer judges them
-- against the actual PR. `execute-scaffold` keeps only its machine criteria (`ci is green`, `a
-- pull request is linked`), which `run.ts`'s scaffold branch now closes itself on success —
-- see that commit for the matching code change.

update criterion c
   set step_task = 'approve-repo-scaffold'
  from workflow_version wv, workflow w
 where c.workflow_version_id = wv.id
   and wv.workflow_id = w.id
   and w.code = 'scaffold-repo'
   and c.step_task = 'execute-scaffold'
   and c.kind = 'done'
   and c.subject_kind is null;              -- judgment criteria only; the mechanical ones stay

do $$
declare
  v_judgment_on_execute int;
  v_judgment_on_approve int;
begin
  select count(*) into v_judgment_on_execute
    from criterion c join workflow_version wv on wv.id = c.workflow_version_id
    join workflow w on w.id = wv.workflow_id
   where w.code = 'scaffold-repo' and c.step_task = 'execute-scaffold'
     and c.kind = 'done' and c.subject_kind is null;
  if v_judgment_on_execute <> 0 then
    raise exception 'execute-scaffold still carries % judgment criteria', v_judgment_on_execute;
  end if;

  select count(*) into v_judgment_on_approve
    from criterion c join workflow_version wv on wv.id = c.workflow_version_id
    join workflow w on w.id = wv.workflow_id
   where w.code = 'scaffold-repo' and c.step_task = 'approve-repo-scaffold'
     and c.kind = 'done' and c.subject_kind is null;
  if v_judgment_on_approve = 0 then
    raise exception 'approve-repo-scaffold did not receive the judgment criteria';
  end if;
end $$;
