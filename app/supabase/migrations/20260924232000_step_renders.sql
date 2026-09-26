-- step_renders.sql — a step says which panel it wants, instead of the job page guessing from
-- whether `produces` happens to be empty.
--
-- THE BUG THIS FIXES IS THE SAME SHAPE AS 057's. "Review and approve the timeline" is a `hitl`
-- step with no `produces` of its own — it reviews the document `draft-timeline` filed, it does not
-- author one. `buildContext` resolved `ctx.produces` from THIS row's own `produces` column only, so
-- it came back null; `draftOf(actor, null)` then returned no draft; and with no draft, both
-- `DraftPanel` (`if (!path) return null`) and `ApprovePanel` (`state === "hitl" && draft && …`)
-- render nothing. The job page fell back to the plain composer, with no document to read and no
-- criteria to check — indistinguishable from a step that genuinely produces nothing.
--
-- Inferring "this step reviews a document" from "produces is empty and depends_on names one row"
-- would have papered over the symptom, but it is inference the app has no business doing: a step
-- with nothing to author, a step reviewing a document, and a step reviewing a CODE CHANGE (see
-- `build/approve-build`, which depends on `respond-to-review`, whose `output` is `code`) all look
-- identical from an empty `produces` column, and only one of them wants the document composer.
--
-- So the row says so. `renders` is CLOSED, same discipline as `output` (057): `doc`/`code` — this
-- row authors, editable; `doc-review`/`code-review` — it reads what its one `depends_on` produced,
-- read-only with a place to comment; `none` — no panel (a machine check, or a `workflow` row whose
-- UI is the nested run). NULL is the common case for anything not yet re-imported under this
-- column, and means no panel — exactly what every row already renders today.

alter table workflow_step add column if not exists renders text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_renders_known') then
    alter table workflow_step add constraint workflow_step_renders_known
      check (renders is null or renders in ('doc', 'code', 'doc-review', 'code-review', 'none'));
  end if;
end $$;

comment on column workflow_step.renders is
  'What panel the job page mounts, from a closed set the app implements: doc/code (this row '
  'authors, editable), doc-review/code-review (read-only, reviews what its one depends_on '
  'produced), none (no panel — a machine check, or a workflow row whose UI is the nested run). '
  'NULL is no panel, same as every row before this column existed. EXPLICIT, never inferred from '
  'produces being empty — a step with nothing to author and a step reviewing someone else''s '
  'document are indistinguishable that way, and only one of them wants the document composer.';

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'workflow_step'::regclass and attname = 'renders' and not attisdropped) then
    raise exception 'workflow_step.renders was not created';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workflow_step_renders_known') then
    raise exception 'workflow_step_renders_known is missing — any string would be a panel';
  end if;
end $$;
