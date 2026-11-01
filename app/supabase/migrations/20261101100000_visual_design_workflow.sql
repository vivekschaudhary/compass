-- visual_design_workflow.sql — a per-epic design workflow, and both design workflows open with the epic.
--
-- An epic's screens are an input to its technical design, its stories and its build, and until now
-- nothing in the process asked for them: the build had the design LIBRARY (tokens and components) and
-- nothing about what the screens are. Design is per epic — a flow only makes sense as a whole — so
-- it is a workflow about one epic, the same shape as `tech-design`:
--
--   1 research-epic-design           designer         a light discovery pass       -> design-research/{epic}
--   2 approve-epic-design-research   product-manager  reviews it
--   3 file-epic-design               designer         SUPPLIES the prototype       -> design/{epic}
--   4 approve-epic-design            product-manager  accepts it
--
-- Row 3 is `output: supplied`: the designer gives Compass the HTML prototype and it is filed as
-- written; the agent cannot author it. (Fetching it from the Jira ticket's attachment is a separate
-- change.)
--
-- `trigger = epic-filed` is the EXISTING trigger, set on `tech-design` and `visual-design`: filing an
-- epic opens their runs idle beside `refine-stories`, so every epic arrives with its design, technical
-- design and stories already named on the board. A person still starts each. It only fires for epics
-- filed from now on; the epics already on the board open theirs from the Jobs page.
--
-- NOT CHANGED, deliberately: no workflow READS `design/{epic}` yet. Adding it to `tech-design`,
-- `refine-stories` or `build` makes an epic with no design report it missing (and, for `build`, where
-- every read is required, refuse). Each is a separate, one-line change once a design is filed.
--
-- The criteria are the ones the importer generates for the same shapes (compare `tech-design` and
-- `design-library`): a draft row closes when its document is published, an approval row when it is
-- published, reviewed by someone who did not write it, and accepted. Written here by hand because the
-- seed CSVs lag the database and importing them would overwrite rows that exist only here.
--
-- Safe to run when the workflow already exists (the live rows were created the same way); it asserts
-- its own effect either way.

do $$
declare
  v_org     uuid;
  v_wf      uuid;
  v_ver     uuid;
  n         int;
begin
  select org_id into v_org from workflow where code = 'tech-design' limit 1;
  if v_org is null then
    raise exception 'expected the tech-design workflow to exist (it names the org this one belongs to)';
  end if;

  select id into v_wf from workflow where code = 'visual-design' and engagement_id is null;

  if v_wf is null then
    insert into workflow (org_id, engagement_id, code, label, workstream_code, phase_code, owner_role_code,
                          trigger, enabled, repeatable, inputs, outputs)
    values (v_org, null, 'visual-design', 'Epic visual design', 'Design', 'Build', 'designer',
            null, true, true, array['deliverables', 'features'], array['design/{epic}'])
    returning id into v_wf;

    insert into workflow_version (workflow_id, version, status, notes, created_by)
    values (v_wf, 1, 'published', 'first version', 'system')
    returning id into v_ver;

    insert into workflow_step (workflow_version_id, ord, kind, role_code, task, title, produces, reads,
                               depends_on, template, renders, output) values
      (v_ver, 1, 'agent', 'designer', 'research-epic-design', 'Research the epic''s design ground',
       'design-research/{epic}', array['deliverables', 'features', 'product-brief', 'design-library'],
       array[]::text[], 'research-findings', 'doc', null),
      (v_ver, 2, 'hitl', 'product-manager', 'approve-epic-design-research', 'Review and approve the design research',
       null, array['design-research/{epic}'], array['research-epic-design'], null, 'doc-review', null),
      (v_ver, 3, 'agent', 'designer', 'file-epic-design', 'File the epic''s design prototype',
       'design/{epic}', array['design-research/{epic}', 'deliverables', 'features', 'design-library'],
       array['approve-epic-design-research'], null, 'doc', 'supplied'),
      (v_ver, 4, 'hitl', 'product-manager', 'approve-epic-design', 'Accept the epic''s design',
       null, array['design/{epic}'], array['file-epic-design'], null, 'doc-review', null);

    insert into criterion (workflow_version_id, kind, ord, statement, subject_kind, subject_ref, operator, value,
                           step_task, generated) values
      (v_ver, 'done', 0, 'design-research/{epic} is published.', 'document', 'design-research/{epic}', 'status', 'published', 'research-epic-design', true),
      (v_ver, 'done', 1, 'design-research/{epic} is published.', 'document', 'design-research/{epic}', 'status', 'published', 'approve-epic-design-research', true),
      (v_ver, 'done', 2, 'The Product Manager did not write what they are reviewing.', null, null, null, null, 'approve-epic-design-research', true),
      (v_ver, 'done', 3, 'Accepted by the Product Manager, and their name is on the close.', null, null, null, null, 'approve-epic-design-research', true),
      (v_ver, 'done', 4, 'design/{epic} is published.', 'document', 'design/{epic}', 'status', 'published', 'file-epic-design', true),
      (v_ver, 'done', 5, 'design/{epic} is published.', 'document', 'design/{epic}', 'status', 'published', 'approve-epic-design', true),
      (v_ver, 'done', 6, 'The Product Manager did not write what they are reviewing.', null, null, null, null, 'approve-epic-design', true),
      (v_ver, 'done', 7, 'Accepted by the Product Manager, and their name is on the close.', null, null, null, null, 'approve-epic-design', true),
      (v_ver, 'ready', 8, 'The doc store answers.', 'connector', 'docs', 'is', 'wired', null, true);
  end if;

  -- Last, so a workflow that is half-made never opens itself for an epic.
  update workflow set trigger = 'epic-filed' where code in ('tech-design', 'visual-design') and engagement_id is null;

  -- It asserts its own effect.
  select count(*) into n from workflow where code in ('tech-design', 'visual-design', 'refine-stories')
     and trigger = 'epic-filed';
  if n <> 3 then
    raise exception 'expected tech-design, visual-design and refine-stories to open with an epic, got %', n;
  end if;

  select wv.id into v_ver from workflow_version wv join workflow w on w.id = wv.workflow_id
   where w.code = 'visual-design' and wv.status = 'published' order by wv.version desc limit 1;
  if v_ver is null then
    raise exception 'visual-design has no published version';
  end if;

  select count(*) into n from workflow_step where workflow_version_id = v_ver;
  if n <> 4 then
    raise exception 'expected visual-design to have 4 steps, got %', n;
  end if;

  select count(*) into n from workflow_step
   where workflow_version_id = v_ver and ord = 3 and output = 'supplied' and produces = 'design/{epic}';
  if n <> 1 then
    raise exception 'file-epic-design should be a supplied row producing design/{epic}';
  end if;

  select count(*) into n from criterion where workflow_version_id = v_ver;
  if n <> 9 then
    raise exception 'expected 9 criteria on visual-design, got %', n;
  end if;
end $$;
