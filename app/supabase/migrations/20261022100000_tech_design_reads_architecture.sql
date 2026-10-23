-- tech_design_reads_architecture.sql — the epic technical design reads the architecture it is
-- bounded by.
--
-- `draft-epic-tech-design` declared `reads: deliverables, features` and nothing else, so the agent
-- was never given the foundation or feature architecture and, correctly, asked the human for the
-- stack. The tier above it is the bar the design is held to (compass/workflows/tech-design.md); the
-- row has to read it. The architect designs from these documents, not from the code.
--
-- Applied to the PUBLISHED version in place, as 20261007073000_scaffold_judgment_to_reviewer does
-- for criteria: the table is the source here, and the seed CSV is not re-imported (the importer
-- would retire workflows that live only in the database). Idempotent — a read already present is
-- not added twice.
--
-- NOT touched: `workflow.inputs`. The nesting row's `ready` criteria are generated from it at
-- import, and adding them by hand here would be a half-import. The design row's own `reads` is
-- what reaches the agent.

update workflow_step s
   set reads = s.reads
        || case when 'foundational-architecture' = any(s.reads) then '{}'::text[]
                else array['foundational-architecture'] end
        || case when 'feature-architecture' = any(s.reads) then '{}'::text[]
                else array['feature-architecture'] end
  from workflow_version wv, workflow w
 where s.workflow_version_id = wv.id
   and wv.workflow_id = w.id
   and w.code = 'tech-design'
   and wv.status = 'published'
   and s.task = 'draft-epic-tech-design';

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
declare
  v_rows int;
  v_missing int;
begin
  select count(*) into v_rows
    from workflow_step s join workflow_version wv on wv.id = s.workflow_version_id
    join workflow w on w.id = wv.workflow_id
   where w.code = 'tech-design' and wv.status = 'published' and s.task = 'draft-epic-tech-design';
  if v_rows = 0 then
    raise exception 'no published draft-epic-tech-design step was found to update';
  end if;

  select count(*) into v_missing
    from workflow_step s join workflow_version wv on wv.id = s.workflow_version_id
    join workflow w on w.id = wv.workflow_id
   where w.code = 'tech-design' and wv.status = 'published' and s.task = 'draft-epic-tech-design'
     and not ('foundational-architecture' = any(s.reads) and 'feature-architecture' = any(s.reads)
              and 'deliverables' = any(s.reads) and 'features' = any(s.reads));
  if v_missing <> 0 then
    raise exception '% draft-epic-tech-design step(s) do not read the architecture, or lost a read', v_missing;
  end if;
end $$;
