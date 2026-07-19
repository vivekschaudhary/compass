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
