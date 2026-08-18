-- 014_milestones.sql — the engagement's plan/milestones, extracted from the SOW at intake and shown
-- READ-ONLY (the SOW is the ground truth committed to the client/product leader — the app never edits it).
-- Run in Supabase. Idempotent.
create table if not exists milestone (
  id            bigint generated always as identity primary key,
  engagement_id text references engagement(id) on delete cascade,
  code          text,        -- M1, M2, … (or a phase label)
  title         text not null,
  timeframe     text,        -- "Month 3" · "Sprint 6" · "Phase 2" — as stated in the SOW
  detail        text,        -- what closes it (deliverables / acceptance)
  ord           int default 0
);
create index if not exists milestone_eng_idx on milestone(engagement_id);
