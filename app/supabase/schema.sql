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

-- Agentic Execution-Help threads (see 017_agent_chat.sql).
create table if not exists chat_thread (
  id            text primary key,
  engagement_id text references engagement(id) on delete cascade,
  role          text,                      -- role lens that owns the thread (COMPASS_ROLES code)
  anchor_kind   text default 'none',       -- ticket | run | job | none
  anchor_id     text,
  title         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table if not exists chat_message (
  id            bigint generated always as identity primary key,
  thread_id     text references chat_thread(id) on delete cascade,
  run_id        text references run(id) on delete cascade,  -- legacy/optional run anchor
  author        text,                      -- human | assistant | tool
  content       text,
  tool_calls    jsonb,                     -- assistant turn: [{id,name,input}]
  tool_result   jsonb,                     -- tool turn: {tool_use_id, content, is_error}
  created_at    timestamptz default now()
);

create index if not exists chat_thread_eng_role on chat_thread(engagement_id, role, updated_at desc);
create index if not exists chat_message_thread  on chat_message(thread_id, created_at);

-- Local demo: reads go through the server (service role). RLS left off for simplicity;
-- enable + add policies before any multi-tenant / hosted use.
