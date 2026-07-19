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
