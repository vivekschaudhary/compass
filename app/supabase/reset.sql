-- Compass DEMO RESET — restores the pristine Acme state. Paste into Supabase SQL Editor + Run.
-- (run this any time after clicking actions to reset the board + queues)

-- Compass one-shot setup (schema + seed). Paste into Supabase SQL Editor and Run.

-- Compass — Supabase schema (one cross-functional scrum team).
-- Run this in the Supabase SQL editor (or via the apply script). Idempotent.

create table if not exists engagement (
  id            text primary key,
  name          text not null,
  client        text,
  sow           text,
  pricing       text,
  budget        int,
  months        int,
  quality_bar   text,
  phase         text,
  overall       text default 'good',
  -- pillar baselines / actuals (the four pillars are COMPUTED from these)
  cost_budget   int,
  cost_spent    int,
  cost_spark    int[] default '{}',
  scope_spark   int[] default '{}',
  time_milestone text,
  time_days_left int,
  stories_late  int default 0,
  time_spark    int[] default '{}',
  quality_ac_pass int,
  quality_criticals int default 0,
  quality_spark int[] default '{}',
  updated_at    timestamptz default now()
);

create table if not exists deliverable (
  id            text primary key,          -- e.g. acme-D1
  engagement_id text references engagement(id) on delete cascade,
  code          text,                      -- D1..D5
  title         text,
  acceptance    text,
  status        text default 'planned',    -- planned | in-progress | done | at-risk
  ord           int default 0
);

create table if not exists member (
  id            text primary key,
  engagement_id text references engagement(id) on delete cascade,
  role          text,                      -- exec | pm | eng | qa | design
  name          text,
  initials      text,
  title         text
);

create table if not exists epic (
  id            text primary key,          -- jira key, e.g. KAN-30
  engagement_id text references engagement(id) on delete cascade,
  title         text,
  deliverable_code text,                   -- grounding: D#
  discipline    text,                      -- Product | Engineering | QA | Design
  phase         text,                      -- Discovery | Build | QA | Launch
  status        text default 'idle',       -- good | warn | bad | idle
  note          text,
  ord           int default 0
);

create table if not exists story (
  id            text primary key,          -- jira key
  epic_id       text references epic(id) on delete cascade,
  title         text,
  assignee      text,
  status        text default 'idle',
  estimate_pts  int,
  ac_pass_pct   int,
  blocked_reason text
);

create table if not exists change_request (
  id            text primary key,
  engagement_id text references engagement(id) on delete cascade,
  title         text,
  detail        text,
  status        text default 'pending'     -- pending | approved | rejected
);

create table if not exists run (
  id            text primary key,          -- run id, e.g. build-KAN-112
  engagement_id text references engagement(id) on delete cascade,
  role          text,
  story         text,
  status        text default 'failed',
  failed_step   text,
  error         text,
  diagnosis     text,
  fix           text,
  resume_from   text,
  created_at    timestamptz default now()
);

create table if not exists chat_message (
  id            bigint generated always as identity primary key,
  run_id        text references run(id) on delete cascade,
  author        text,                      -- ai | human
  content       text,
  created_at    timestamptz default now()
);

-- Local demo: reads go through the server (service role). RLS left off for simplicity;
-- enable + add policies before any multi-tenant / hosted use.

-- Compass seed — Acme Customer Portal (SOW-2041), one cross-functional scrum team.
-- Idempotent: clears the engagement (cascades) then re-inserts.

delete from engagement where id = 'acme';

insert into engagement (id, name, client, sow, pricing, budget, months, quality_bar, phase, overall,
  cost_budget, cost_spent, cost_spark, scope_spark, time_milestone, time_days_left, stories_late,
  time_spark, quality_ac_pass, quality_criticals, quality_spark)
values ('acme', 'Acme Customer Portal', 'Acme Corp', 'SOW-2041', 'Fixed-bid', 480000, 6,
  'WCAG 2.1 AA · 99.9% uptime', 'Build · Phase 2 of 4', 'warn',
  480000, 172000, '{8,15,21,26,30,34,36}', '{40,55,70,80,88,95,100}',
  'M2', 6, 2, '{10,22,33,41,48,54,58}', 94, 0, '{76,82,85,88,90,92,94}');

insert into deliverable (id, engagement_id, code, title, acceptance, status, ord) values
  ('acme-D1','acme','D1','Discovery','Findings summary accepted by client','done',1),
  ('acme-D2','acme','D2','Auth & Accounts','SSO + account CRUD per §3.1','in-progress',2),
  ('acme-D3','acme','D3','Dashboard','Portal dashboard per §3.2','at-risk',3),
  ('acme-D4','acme','D4','Reporting','Exportable reports per §3.3','planned',4),
  ('acme-D5','acme','D5','Launch','Production launch + handover','planned',5);

insert into member (id, engagement_id, role, name, initials, title) values
  ('m-exec','acme','exec','Dana Whit','DW','Delivery Exec'),
  ('m-pm','acme','pm','Jen Okafor','JO','Product Manager'),
  ('m-eng','acme','eng','Maria Santos','MS','Engineer'),
  ('m-qa','acme','qa','Priya Nair','PN','QA Engineer'),
  ('m-design','acme','design','Alex Ree','AR','Designer');

insert into epic (id, engagement_id, title, deliverable_code, discipline, phase, status, note, ord) values
  ('KAN-20','acme','Auth','D2','Engineering','Build','good',null,1),
  ('KAN-30','acme','Dashboard UI','D3','Engineering','Build','warn','KAN-112 blocked 3d',2),
  ('KAN-22','acme','Auth test suite','D2','QA','Build','good',null,3),
  ('KAN-40','acme','Portal regression','D4','QA','QA','idle',null,4),
  ('KAN-30d','acme','Dashboard design','D3','Design','Build','good',null,5);

insert into story (id, epic_id, title, assignee, status, estimate_pts, ac_pass_pct, blocked_reason) values
  ('KAN-101','KAN-20','Login','Maria','good',5,100,null),
  ('KAN-102','KAN-20','SSO','Sam','good',8,96,null),
  ('KAN-112','KAN-30','Filter bar','Maria','warn',5,60,'design sub-task KAN-30d not delivered'),
  ('KAN-118','KAN-30','Saved views','Maria','warn',3,40,'behind phase target'),
  ('KAN-22a','KAN-22','Auth happy-path suite','Priya','good',5,94,null);

insert into change_request (id, engagement_id, title, detail, status) values
  ('cr-csv','acme','“CSV export” requested — not in SOW-2041',
   'Client asked mid-sprint. Grounds to no deliverable. Fixed-bid: blocked until a change request is approved.',
   'pending');

insert into run (id, engagement_id, role, story, status, failed_step, error, diagnosis, fix, resume_from) values
  ('build-KAN-112','acme','Engineer','KAN-112 · Filter bar','failed','step 4 — CI-parity checks',
   '2 tests failing in dashboard.filters.test.ts (empty-state render)',
   'The build stopped at the checks step, not in code review. Two filter tests fail because the design sub-task (KAN-30d) landed a new empty-state that the story''s fixtures don''t cover yet — the diff is correct, the fixtures are stale. This isn''t a logic bug; it''s an un-synced test fixture.',
   'Update the empty-state fixture in dashboard.filters.test.ts to match KAN-30d, then resume.',
   'step 4 (checks)');

-- Compass migration 002 — per-role jobs-to-do queue. Run in the Supabase SQL Editor. Idempotent.

create table if not exists job (
  id              text primary key,
  engagement_id   text references engagement(id) on delete cascade,
  role            text,               -- exec | pm | eng | qa | design
  kind            text,               -- review | approve | deliver | blocked | drafting
  title           text,
  subtitle        text,
  meta            text,
  related         text,               -- jira key / deliverable
  primary_label   text,
  secondary_label text,
  tone            text default 'default',  -- default | warn | bad
  ord             int default 0
);

delete from job where engagement_id = 'acme';

insert into job (id, engagement_id, role, kind, title, subtitle, meta, related, primary_label, secondary_label, tone, ord) values
  -- Product Manager (Jen)
  ('j-pm-1','acme','pm','review','Review 4 stories — D3 Dashboard','Your PM agent decomposed D3 into functional stories, grounded to the deliverable.','AI-decomposed · 1 flagged scope creep','D3','Review','Approve all','default',1),
  ('j-pm-2','acme','pm','review','Review brief — D4 Reporting','Normalized from SOW §4. 3 open questions to resolve before decomposition.','AI-drafted','D4','Review',null,'default',2),
  ('j-pm-3','acme','pm','approve','KAN-112 — ready to build?','Functionally ready, but the design sub-task is undelivered. Approve the gate or hold.',null,'KAN-112','Approve','Hold','default',3),
  -- Engineer (Maria)
  ('j-eng-1','acme','eng','review','Review PR — KAN-101 Login','Your engineer agent implemented it and tests are green. Your review + merge.','AI-built · CI ✓','KAN-101','Review & merge',null,'default',4),
  ('j-eng-2','acme','eng','blocked','KAN-112 Filter bar','Can''t start — blocked by the design sub-task (KAN-30d, Alex).',null,'KAN-112','Get help','Raise CR','warn',5),
  ('j-eng-3','acme','eng','drafting','Tech-design — KAN-105 Saved filters','Your architect agent is drafting the technical approach, grounded in the code…',null,'KAN-105',null,null,'default',6),
  -- QA (Priya)
  ('j-qa-1','acme','qa','review','Review test plan — KAN-22 Auth suite','Your QA agent drafted the auth happy-path + edge coverage.','AI-drafted','KAN-22','Review',null,'default',7),
  ('j-qa-2','acme','qa','drafting','KAN-40 Portal regression','Queued — begins once the Build phase closes.',null,'KAN-40',null,null,'default',8),
  -- Design (Alex)
  ('j-design-1','acme','design','deliver','Deliver — KAN-30d Dashboard design','Compass specced the requirements; deliver the Figma. This unblocks KAN-112.','needs-design · blocking','KAN-30d','Deliver Figma',null,'warn',9),
  -- Delivery Exec (Dana)
  ('j-exec-1','acme','exec','approve','Approve change request — “CSV export”','Out of SOW-2041. Fixed-bid: needs client sign-off before it enters scope (billable).','boundary crossing','cr-csv','Approve CR','Decline','bad',10);
