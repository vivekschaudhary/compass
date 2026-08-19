-- Fix 003400: it changed nothing, and said it succeeded.
--
-- 003400 tried to widen `workflow_step.kind` with:
--
--     if not exists (select 1 from pg_constraint where conname = 'workflow_step_kind_known') then
--       alter table workflow_step add constraint workflow_step_kind_known check (kind in (...))
--
-- A constraint of exactly that name already existed, from 002300 — `check (kind in
-- ('agent','hitl','machine'))`. So the guard found it, skipped, and the migration reported
-- "Finished". Inserting a legitimately nesting step was still refused. The guard was written to
-- make the migration re-runnable and instead made it a no-op that looked like a success, which is
-- the same false-green shape this product exists to eliminate. A named constraint that must CHANGE
-- gets dropped and recreated; `if not exists` is only safe for something being created once.
--
-- Two real facts about the old schema this has to respect:
--   · 'machine' was already a kind — 003400 invented 'code' and 'gate' without checking, so the
--     vocabulary now covers what exists rather than what I assumed existed.
--   · workflow_step_role_matches_kind requires role_code for agent/hitl and forbids it for machine.
--     A nesting step HAS an owner — the row names who is accountable for the nested work — so
--     'workflow' joins the roled kinds.

alter table workflow_step drop constraint if exists workflow_step_kind_known;
alter table workflow_step add  constraint workflow_step_kind_known
  check (kind in ('agent','hitl','machine','workflow'));

alter table workflow_step drop constraint if exists workflow_step_role_matches_kind;
alter table workflow_step add  constraint workflow_step_role_matches_kind check (
  (kind in ('agent','hitl','workflow') and role_code is not null) or
  (kind = 'machine'                    and role_code is null)
);

-- Prove it, in the migration itself, rather than trusting that it took. If either of these fails
-- the migration fails, and the next one cannot build on a constraint that was never widened.
do $$
declare
  v_ver uuid;
  v_id  uuid;
begin
  select id into v_ver from workflow_version limit 1;
  if v_ver is null then
    raise notice 'No workflow_version rows — skipping the self-check.';
    return;
  end if;

  insert into workflow_step (workflow_version_id, ord, kind, role_code, task, nests_workflow_code)
  values (v_ver, 9999, 'workflow', 'delivery-manager', 'self-check', 'build')
  returning id into v_id;
  delete from workflow_step where id = v_id;

  begin
    insert into workflow_step (workflow_version_id, ord, kind, role_code, task)
    values (v_ver, 9998, 'workflow', 'delivery-manager', 'self-check');
    raise exception 'A nesting step with no target was accepted — the nests_iff_workflow constraint is not holding.';
  exception when check_violation then
    null;  -- expected
  end;
end $$;
