-- Both judgment criteria on `approve-repo-scaffold` describe the OLD design — a model that wrote
-- `compass/config.yaml` and a `.github/workflows` file itself, verified by GitHub Actions because
-- there was no local checkout. The generator does neither: it runs a pinned, deterministic command
-- for a framework named in the accepted record, and the checks run locally, recorded on the
-- handoff (the `ci` criterion already reads that). Asking a reviewer to confirm files that are
-- never written is not a stricter bar — it is a question with no honest answer, and it was blocking
-- a live review (CT-273) for exactly that reason.
--
-- Rewritten to what the generator actually does: the framework matches the accepted record, the PR
-- contains only that generator's standard output, and the config/CI-file gap is named so a reviewer
-- isn't left assuming CI is wired when it is not.

update criterion
   set statement = 'The scaffold used the framework named in the accepted scaffold-record, and the '
     || 'pull request contains only that generator''s standard starter output — nothing hand-written '
     || 'or out of scope.'
 where step_task = 'approve-repo-scaffold'
   and kind = 'done'
   and subject_kind is null
   and statement like 'Writes compass/config.yaml%';

update criterion
   set statement = 'compass/config.yaml and a .github/workflows CI file are not yet written by this '
     || 'generator — a known gap, not a defect in this PR. Confirm you are accepting the PR on that '
     || 'basis, not assuming CI is wired beyond the checks already recorded.'
 where step_task = 'approve-repo-scaffold'
   and kind = 'done'
   and subject_kind is null
   and statement like 'Every file created matches%';

do $$
declare
  v_stale int;
begin
  select count(*) into v_stale
    from criterion
   where step_task = 'approve-repo-scaffold' and kind = 'done' and subject_kind is null
     and (statement like 'Writes compass/config.yaml%' or statement like 'Every file created matches%');
  if v_stale <> 0 then
    raise exception '% judgment criteria on approve-repo-scaffold still describe the old design', v_stale;
  end if;
end $$;
