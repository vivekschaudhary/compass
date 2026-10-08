-- Both generator-shaped criteria on `approve-repo-scaffold` assume every repo gets a PR from the
-- generator. `scaffold-repo`'s own fan-out does not guarantee that: a repo in the accepted record
-- can be registration-only (framework `unsupported/manual`, as `art-swap-ios` is), with no
-- `execute-scaffold` task, no checkout, no PR — nothing for "the PR contains only the generator's
-- output" to even refer to. Asking a reviewer to confirm a PR that was never going to exist is the
-- exact mistake already made once on this same step for `art-swap-backend`'s generator-shaped
-- criteria; this closes the same gap for the opposite case before it repeats.
--
-- Rewritten to state what is true either way, not to assume one path.

update criterion
   set statement = 'If this repo was built: the generator ran the framework named in the accepted '
     || 'record, and the pull request contains only its standard output — nothing hand-written or '
     || 'out of scope. If this repo is registration-only (no framework the generator supports): '
     || 'confirm that is what the record actually says, not an assumption, and that no file tree '
     || 'was wrongly created or wrongly skipped.'
 where step_task = 'approve-repo-scaffold'
   and kind = 'done'
   and subject_kind is null
   and statement like 'The scaffold used the framework%';

update criterion
   set statement = 'If this repo was built: compass/config.yaml and a .github/workflows CI file are '
     || 'not yet written by this generator — a known gap, not a defect. Confirm you are accepting on '
     || 'that basis, not assuming CI is wired beyond the checks already recorded. If this repo is '
     || 'registration-only: confirm no CI is expected, since nothing was generated to check.'
 where step_task = 'approve-repo-scaffold'
   and kind = 'done'
   and subject_kind is null
   and statement like 'compass/config.yaml and a .github/workflows CI file are not yet written%';

do $$
declare v_stale int;
begin
  select count(*) into v_stale
    from criterion
   where step_task = 'approve-repo-scaffold' and kind = 'done' and subject_kind is null
     and (statement like 'The scaffold used the framework named in the accepted scaffold-record, and the pull request contains only that generator%'
          or statement like 'compass/config.yaml and a .github/workflows CI file are not yet written by this generator%');
  if v_stale <> 0 then
    raise exception '% criteria still assume every repo was built', v_stale;
  end if;
end $$;
