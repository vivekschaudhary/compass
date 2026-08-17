-- 016_agent_questions.sql — the agent-asks-questions primitive (role-agnostic).
-- Any agent, on any task, files a STRUCTURED clarifying question here instead of guessing/defaulting;
-- it surfaces in the ASKING role's jobs-to-do and is answered with a pick/field applied directly to
-- an allowlisted target. See AGENTS.md `[agent-asks-structured-questions]` + app/lib/questions.ts.

create table if not exists agent_question (
  id            text primary key,
  engagement_id text references engagement(id) on delete cascade,
  role          text,                          -- the asking agent (COMPASS_ROLES code)
  source        text,                          -- task/kind that raised it (e.g. 'intake', 'refine')
  key           text,                          -- stable id within a source (e.g. 'budget', 'lead-qa')
  prompt        text,
  type          text default 'text',           -- choice | number | text
  options       text[],                        -- choice only
  target        jsonb,                          -- { table, id, column } — allowlisted (app/lib/questions.ts)
  because       text,                          -- the gap/inference driving the ask (job subtitle)
  related       text,                          -- ticket / deep-link, optional
  answer        text,
  status        text default 'open',           -- open | answered
  ord           int  default 0,
  created_at    timestamptz default now()
);

create index if not exists agent_question_eng  on agent_question(engagement_id);
create index if not exists agent_question_open on agent_question(engagement_id, status);
