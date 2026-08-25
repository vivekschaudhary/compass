-- An answer can BE a document.
--
-- The SOW arrives from the delivery manager, in a conversation, and it must land verbatim. If the
-- agent takes the pasted text and drafts it into `02-scope/sow`, it paraphrases — and a summarised
-- contract is the worst document this system could hold, because every downstream document cites it
-- and none of them can tell they are citing a summary.
--
-- So the agent ASKS and the app FILES. A question carries the path its answer becomes; when the
-- answer is recorded, the text is sectioned and filed unmodified through the same routine intake
-- uses. Nothing rewrites it, and the agent never sees it as something to improve.
--
-- Reusable by construction: the BRD, a policy document, a client's existing backlog — anything a
-- person supplies as text lands the same way.

alter table question add column if not exists files_to text;

comment on column question.files_to is
  'The document path this answer becomes, filed VERBATIM. Null for an ordinary question. The agent '
  'asks; the app files — an agent drafting a supplied contract would paraphrase it.';
