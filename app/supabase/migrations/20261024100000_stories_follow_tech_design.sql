-- stories_follow_tech_design.sql — an epic's stories are cut against its technical design.
--
-- Where the boundaries sit, what has to be built first and which pieces are risky decide how an
-- epic splits into stories, and story points written without the design are guesses. `refine-stories`
-- opens the moment an epic reaches the board (trigger `epic-filed`), at the same time as
-- `tech-design`, so nothing made one wait for the other. Two changes, both in the tables — the seed
-- CSV does not carry this workflow and is not re-imported:
--
--   1. `draft-epic-stories` reads `epic/{epic}`, the design, as an input — pinned like any other, so
--      the agent cuts the stories against what the architect decided.
--   2. a READY criterion on the same step: the design document must exist before the row can start.
--      `start_task` enforces ready criteria (lib/data/start-gate.ts), so the Start button refuses
--      with the reason instead of a story set being drafted from nothing.
--
-- WHAT THE GATE DOES NOT MEAN. The `document status = published` check is true once the design is
-- FILED (file_document publishes the version); it is not true only once the principal engineer has
-- ACCEPTED it. This gates on "a design exists", not "a design is accepted". Gating on acceptance
-- needs an evaluator that reads the accepting task's state, which does not exist yet.
--
-- Applied to the published version in place, as 20261022100000 does for tech-design. Idempotent.

update workflow_step s
   set reads = s.reads || array['epic/{epic}']
  from workflow_version wv, workflow w
 where s.workflow_version_id = wv.id
   and wv.workflow_id = w.id
   and w.code = 'refine-stories'
   and wv.status = 'published'
   and s.task = 'draft-epic-stories'
   and not ('epic/{epic}' = any(s.reads));

insert into criterion (workflow_version_id, kind, ord, statement, subject_kind, subject_ref, operator, value, step_task, generated, created_by, updated_by)
select wv.id, 'ready',
       coalesce((select max(c.ord) + 1 from criterion c where c.workflow_version_id = wv.id), 0),
       'The epic''s technical design has been drafted (epic/{epic} is published) — its stories are cut against it.',
       'document', 'epic/{epic}', 'status', 'published', 'draft-epic-stories', false, 'system', 'system'
  from workflow_version wv join workflow w on w.id = wv.workflow_id
 where w.code = 'refine-stories' and wv.status = 'published'
   and not exists (
     select 1 from criterion c
      where c.workflow_version_id = wv.id and c.step_task = 'draft-epic-stories'
        and c.kind = 'ready' and c.subject_kind = 'document' and c.subject_ref = 'epic/{epic}'
   );

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
declare
  v_steps int;
  v_reads_ok int;
  v_gate_ok int;
begin
  select count(*) into v_steps
    from workflow_step s join workflow_version wv on wv.id = s.workflow_version_id
    join workflow w on w.id = wv.workflow_id
   where w.code = 'refine-stories' and wv.status = 'published' and s.task = 'draft-epic-stories';
  if v_steps = 0 then raise exception 'no published draft-epic-stories step was found to update'; end if;

  select count(*) into v_reads_ok
    from workflow_step s join workflow_version wv on wv.id = s.workflow_version_id
    join workflow w on w.id = wv.workflow_id
   where w.code = 'refine-stories' and wv.status = 'published' and s.task = 'draft-epic-stories'
     and 'epic/{epic}' = any(s.reads) and 'deliverables' = any(s.reads) and 'features' = any(s.reads);
  if v_reads_ok <> v_steps then raise exception 'draft-epic-stories does not read the design, or lost a read'; end if;

  select count(*) into v_gate_ok
    from criterion c join workflow_version wv on wv.id = c.workflow_version_id
    join workflow w on w.id = wv.workflow_id
   where w.code = 'refine-stories' and wv.status = 'published' and c.step_task = 'draft-epic-stories'
     and c.kind = 'ready' and c.subject_kind = 'document' and c.subject_ref = 'epic/{epic}'
     and c.operator = 'status' and c.value = 'published';
  if v_gate_ok <> v_steps then raise exception 'draft-epic-stories has no ready gate on the design'; end if;
end $$;
