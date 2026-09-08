-- 053_feature_decision.sql — learn. The verdict that ends one turn of the loop.
--
-- The REASONING is a document. That is not a shortcut: every deliverable in this system is drafted
-- by an agent, cited, reviewed per criterion and accepted by a named human at a gate, and a learn
-- write-up is a deliverable like any other. Duplicating its argument into a text column here would
-- create a second copy that nobody updates.
--
-- The VERDICT is a row, because "how many bets did we kill this quarter" must be arithmetic rather
-- than four people reading four pages. One enumerated word, and a pointer to the document that
-- earned it.
--
-- ONE VERDICT PER RUN, NOT PER FEATURE. A feature that persevered, persevered again and then
-- pivoted has three verdicts; a column on `feature` could only remember the last, and the history —
-- which is the entire value of running a loop — would be gone. `unique (run_id)` is also the
-- idempotency hinge, the same role `work_task.sprint_no` plays for sprint planning: approving the
-- same learn step twice records the decision once instead of stacking a second one beside it.
--
-- `decided_by` IS NOT NULL. A verdict with no name attached is the thing this product exists to
-- replace — status without attribution. `decided_at`/`decided_by` ARE this row's creation moment
-- and author, so per 044's second rule no `created_at`/`created_by` is added beside them.
--
-- 'kill' DOES NOT RETIRE THE FEATURE HERE. Setting `feature.retired_at` from a trigger on this
-- table would hide a consequential act inside a write. The learn step does both, visibly, and a
-- feature killed on paper but still open in the queue is a discrepancy worth being able to SEE.

create table if not exists feature_decision (
  id            uuid primary key default gen_random_uuid(),
  feature_id    uuid not null references feature(id) on delete cascade,
  -- the turn of the loop this ends
  run_id        uuid not null references workflow_run(id) on delete cascade,
  -- persevere — the bet is working, go round again
  -- pivot      — the hypothesis was wrong, the problem is still worth solving
  -- kill       — stop
  -- inconclusive — the measurement could not answer. A real outcome, and the one that must not be
  --                quietly recorded as 'persevere'.
  verdict       text not null,
  rationale_doc_id uuid references document(id) on delete set null,
  -- a named human. Not 'system'.
  decided_by    text not null,
  decided_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    text,
  unique (run_id),
  constraint feature_decision_verdict_known
    check (verdict in ('persevere', 'pivot', 'kill', 'inconclusive'))
);

create index if not exists feature_decision_by_feature
  on feature_decision (feature_id, decided_at desc);

comment on table feature_decision is
  'The verdict ending one turn of a feature''s build/measure/learn loop. The reasoning lives in the '
  'rationale document; this row exists so roll-up is arithmetic. One per run — a feature''s history '
  'is the sequence of these.';
comment on column feature_decision.verdict is
  'persevere | pivot | kill | inconclusive. `inconclusive` is a real outcome — the measurement could '
  'not answer — and must never be recorded as persevere.';
comment on column feature_decision.decided_by is
  'The human who accepted it, at the gate. NOT NULL: an unattributed verdict is the status theatre '
  'this system replaces.';

drop trigger if exists touch_audit on feature_decision;
create trigger touch_audit before insert or update on feature_decision
  for each row execute function touch_audit_columns();

-- ── the migration asserts its own effect ─────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.feature_decision') is null then
    raise exception 'feature_decision was not created';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'feature_decision'::regclass and tgname = 'touch_audit' and not tgisinternal) then
    raise exception 'touch_audit is not attached to feature_decision — updated_at would never move';
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'feature_decision_verdict_known') then
    raise exception 'feature_decision_verdict_known is missing — any string would be a verdict';
  end if;
  -- 044 drives its column-adding loop off the catalogue and would have added created_at here had
  -- it run after this. It did not, so the absence below is the intended shape rather than an
  -- accident — asserted so a future reader does not "fix" it.
  if not exists (
    select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
     where i.indrelid = 'feature_decision'::regclass and i.indisunique
       and c.relname like '%run_id%') then
    raise exception 'feature_decision has no unique constraint on run_id — approving a learn step twice would record two verdicts';
  end if;
end $$;
