-- 017_agent_chat.sql — persistent threads for the agentic Execution-Help assistant.
-- Turns the read-only AssistantDock into a real per-role conversation: any role opens a thread
-- (free-form, or anchored to a ticket/run/job), the agent reads real state + takes allowlisted
-- actions with per-write confirmation, and the whole exchange persists. See app/lib/agent-*.ts.
-- Reshapes the previously-dead run-only `chat_message` into a thread-aware transcript.

create table if not exists chat_thread (
  id            text primary key,
  engagement_id text references engagement(id) on delete cascade,
  role          text,                          -- the role lens that owns the thread (COMPASS_ROLES code)
  anchor_kind   text default 'none',           -- ticket | run | job | none
  anchor_id     text,                          -- the anchored item's id (story key / run id / job id)
  title         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- chat_message existed (run-only, unused). Make it thread-aware without dropping it.
alter table chat_message add column if not exists thread_id   text references chat_thread(id) on delete cascade;
alter table chat_message add column if not exists tool_calls  jsonb;   -- assistant turn: [{id,name,input}]
alter table chat_message add column if not exists tool_result jsonb;   -- tool turn: {tool_use_id, content, is_error}
-- author widens from ai|human to human|assistant|tool; run_id stays (nullable) for run-anchored turns.

create index if not exists chat_thread_eng_role on chat_thread(engagement_id, role, updated_at desc);
create index if not exists chat_message_thread  on chat_message(thread_id, created_at);
