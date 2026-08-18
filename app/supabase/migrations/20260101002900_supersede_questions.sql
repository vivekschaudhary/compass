-- 029_supersede_questions.sql — a question the agent moved past is not an open question.
--
-- When the agent drafts, it has decided it can proceed and name what is still unresolved inside the
-- deliverable. Any question it had outstanding at that moment is no longer blocking — but it was
-- never answered either, and marking it `answered` would put words in a person's mouth and break
-- the constraint that says an answered question carries an answer.
--
-- So: a third state. The same shape as measurements, for the same reason — "resolved", "not
-- resolved", and "no longer being asked" are three different facts, and collapsing the third into
-- either of the others makes the record lie about what a person was asked to do.
--
-- Without this the queue keeps showing questions the agent abandoned two runs ago, which reads as
-- the agent asking the same thing over and over.

alter table question drop constraint if exists question_state_known;
alter table question add constraint question_state_known
  check (state in ('open', 'answered', 'superseded'));

-- An answered question has an answer; a superseded one deliberately does not.
alter table question drop constraint if exists question_answered_has_answer;
alter table question add constraint question_answered_has_answer check (
  (state = 'answered' and answer is not null) or
  (state in ('open', 'superseded') and answer is null)
);

alter table question add column if not exists superseded_at     timestamptz;
alter table question add column if not exists superseded_reason text;

-- A superseded question says when and why. "The agent drafted anyway" is a fact worth keeping:
-- it is the difference between a question that was resolved and one that was worked around.
alter table question drop constraint if exists question_superseded_has_when;
alter table question add constraint question_superseded_has_when check (
  (state = 'superseded' and superseded_at is not null) or
  (state <> 'superseded' and superseded_at is null)
);

-- Close out the ones already stranded by the run that could not see its own conversation.
update question
   set state = 'superseded',
       superseded_at = now(),
       superseded_reason = 'The agent drafted without these answers and named what was unresolved in the document.'
 where state = 'open'
   and task_id in (select id from work_task where state in ('hitl', 'closed'));
