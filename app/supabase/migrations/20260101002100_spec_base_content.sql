-- 021_spec_base_content.sql — keep the baseline TEXT, not just its hash.
--
-- `base_hash` (020) can prove a default changed. It cannot say HOW — and "how" is the question that
-- matters: did the framework's change touch the part I edited? Diffing an override against the NEW
-- default does not answer that, because for a 400-line workflow it renders a wall of differences,
-- most of them the reader's own edits.
--
-- Storing the baseline as it stood at fork time makes the useful view possible: OLD default → NEW
-- default, isolated from anything the reader changed.
--
-- Rows written before this migration have base_content NULL and degrade to detect-only — the app
-- says "the default has changed; the previous version wasn't recorded" rather than fabricating a
-- comparison it cannot make.

alter table spec_file add column if not exists base_content text;
