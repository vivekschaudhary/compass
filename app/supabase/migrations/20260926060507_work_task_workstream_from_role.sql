-- work_task_workstream_from_role.sql — a task carries ITS OWN ROLE'S workstream, not the
-- workstream of the workflow whose run happens to contain it.
--
-- 20260925161435_work_task_workstream_code.sql fixed workstream_code being null on every row, but
-- picked the wrong source: `v_wf.workstream_code`, the ENCLOSING WORKFLOW's own workstream. That
-- is right for a single-team workflow (product-brief, all Product) and wrong for a multi-role
-- umbrella like sprint-0, whose eleven steps span Delivery, Product, Design and Engineering under
-- one Delivery-owned run. Every one of those eleven tasks got stamped `Delivery`, `role_code`
-- notwithstanding.
--
-- Caught live: staff-engineer (workstream Engineering, `scope: workstream`) clicked "Open
-- Foundation architecture" — a sprint-0 step — and `tasksFor`'s `eq("workstream_code",
-- "Engineering")` found no match against the row's actual `Delivery`, so `startTask`'s
-- "confirm the task is inside this actor's scope" guard refused it: "That task is not in your
-- queue." True by the letter of the check and false in fact — the task WAS staff-engineer's; the
-- column just lied about which workstream it belonged to. `everyone`/`mine`-scoped roles never
-- hit this filter, which is why product-owner, product-manager and designer's own sprint-0 rows
-- never surfaced it, and why researcher's own case (the one 161435 was written for) happened to
-- read as fixed — `product-brief`'s workflow-level workstream (Product) coincidentally equals
-- researcher's own.
--
-- THE FIX: derive `workstream_code` from `role.workstream_code` for the step's own role
-- (`coalesce(v_step.role_code, v_wf.owner_role_code)` — same resolution the row's `role_code`
-- column already uses), falling back to the workflow's workstream only when that role carries
-- none. Two-tier, same precedence every other role lookup in this app already uses: an
-- engagement-level override wins over the org default.

create or replace function open_workflow_run(
  p_org_id uuid, p_engagement_id text, p_workflow_code text,
  p_actor text default null, p_actor_role text default null
) returns uuid as $$
declare
  v_wf workflow%rowtype; v_ver workflow_version%rowtype;
  v_step workflow_step%rowtype; v_run_id uuid;
  v_role_code text; v_role_ws text;
begin
  perform compass_set_actor(p_actor, p_actor_role, 'human');

  select * into v_wf from workflow
   where org_id = p_org_id and code = p_workflow_code
     and (engagement_id = p_engagement_id or engagement_id is null)
   order by engagement_id nulls last limit 1;
  if not found then
    raise exception 'No workflow % for this org. Import it before opening a run.', p_workflow_code;
  end if;

  select * into v_ver from workflow_version where workflow_id = v_wf.id and status = 'published';
  if not found then
    raise exception 'Workflow % has no published version.', p_workflow_code;
  end if;

  insert into workflow_run (org_id, engagement_id, workflow_id, workflow_version_id,
                            owner_role_code, opened_by)
  values (p_org_id, p_engagement_id, v_wf.id, v_ver.id, v_wf.owner_role_code, p_actor)
  returning id into v_run_id;

  insert into event (org_id, engagement_id, actor_kind, actor_role_code, actor_user_id,
                     subject_type, subject_id, verb, payload)
  values (p_org_id, p_engagement_id, 'human', p_actor_role, p_actor,
          'workflow_run', v_run_id, 'workflow.opened',
          jsonb_build_object('workflow', p_workflow_code, 'version', v_ver.version));

  for v_step in
    select * from workflow_step
     where workflow_version_id = v_ver.id and conditional is null
     order by ord
  loop
    v_role_code := coalesce(v_step.role_code, v_wf.owner_role_code);

    -- Same two-tier precedence every other role lookup in this app uses: an engagement-level
    -- override wins over the org default. Null when the role itself carries no workstream (a
    -- role can legitimately have none), in which case the workflow's own is still the honest
    -- fallback — better than leaving the column null again.
    select r.workstream_code into v_role_ws
      from role r
     where r.org_id = p_org_id and r.code = v_role_code
       and (r.engagement_id = p_engagement_id or r.engagement_id is null)
     order by r.engagement_id nulls last
     limit 1;

    insert into work_task (org_id, engagement_id, workflow_run_id, workflow_step_id,
                      role_code, kind, title, created_by, workstream_code)
    values (p_org_id, p_engagement_id, v_run_id, v_step.id,
            v_role_code,
            case when v_step.kind = 'hitl' then 'hitl' else 'agent' end,
            coalesce(nullif(v_step.title, ''), nullif(v_step.task, ''), 'Step ' || v_step.ord),
            p_actor, coalesce(v_role_ws, v_wf.workstream_code));

    v_role_ws := null;
  end loop;

  return v_run_id;
end;
$$ language plpgsql;

-- ── correction ────────────────────────────────────────────────────────────────────────────────
-- Every row the PREVIOUS (workflow-sourced) logic already wrote, wherever the role-sourced answer
-- disagrees with it — not scoped to one engagement, since the defect wasn't. `distinct from` so a
-- row that was already correct (a single-team workflow, or one whose role happens to share the
-- workflow's own workstream) is left untouched rather than rewritten to the same value.
update work_task t
   set workstream_code = correct.ws
  from (
    select t2.id,
           coalesce(
             (select r.workstream_code from role r
               where r.org_id = t2.org_id and r.code = t2.role_code
                 and (r.engagement_id = t2.engagement_id or r.engagement_id is null)
               order by r.engagement_id nulls last limit 1),
             w.workstream_code
           ) as ws
      from work_task t2
      join workflow_run run on run.id = t2.workflow_run_id
      join workflow w on w.id = run.workflow_id
  ) correct
 where correct.id = t.id
   and correct.ws is distinct from t.workstream_code;

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
declare v_mismatched int;
begin
  select count(*) into v_mismatched
    from work_task t
    join workflow_run run on run.id = t.workflow_run_id
    join workflow w on w.id = run.workflow_id
    left join lateral (
      select r.workstream_code from role r
       where r.org_id = t.org_id and r.code = t.role_code
         and (r.engagement_id = t.engagement_id or r.engagement_id is null)
       order by r.engagement_id nulls last limit 1
    ) r on true
   where coalesce(r.workstream_code, w.workstream_code) is distinct from t.workstream_code;
  if v_mismatched > 0 then
    raise exception 'correction left % task(s) whose workstream_code still disagrees with their role', v_mismatched;
  end if;
end $$;
