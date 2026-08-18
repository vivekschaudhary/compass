-- 006_team.sql — team-member tenure + notes, editable from engagement settings.
-- Run in the Supabase SQL editor.
alter table member add column if not exists start_date date;
alter table member add column if not exists end_date   date;
alter table member add column if not exists comments   text;
alter table member add column if not exists ord        int default 0;
