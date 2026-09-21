-- `document.published` fires ONCE, and only when the document has actually reached the doc store.
--
-- Observed on a real run, filing a SOW:
--
--     02:57:46.546  document.published   ← nothing was in Confluence yet
--     02:57:46.782  document.filed
--     02:57:50.877  document.published   ← the real write, 4.3s later
--
-- Two events for one version, and the FIRST one was a claim that had not come true. The log said a
-- document reached the client's doc store several seconds before it did, and said it twice.
--
-- THE CAUSE IS TWO MEANINGS OF ONE WORD.
--
--   `document_version.status = 'published'`   this is the CURRENT version inside Compass
--   `published_to_docs_at is not null`        it reached Confluence / Teams
--
-- `track_current_version` fired on `status = 'published'`, which `file_document` sets at INSERT —
-- so the event was emitted by the act of FILING, which `document.filed` already records. Then
-- `publishToDocs` updated the row with the external id and the same trigger fired again.
--
-- So the event now keys on the second meaning, on the transition that makes it true: null →
-- not-null on `published_to_docs_at`. One event, at the moment it is not a lie.
--
-- A CONSEQUENCE WORTH STATING: a document filed on an engagement whose doc store is not configured
-- now emits NO `document.published` at all. That is the point. It was never published, and
-- `document.filed` still records that it exists. `publish_error` exists precisely so a failure is
-- visible, and an event claiming success alongside it made that column argue with the log.
--
-- The `current_version_id` projection is unchanged: it is about Compass's own current version, and
-- it correctly follows `status`.

create or replace function document_track_current_version() returns trigger as $$
begin
  -- Compass's current version. Keyed on `status`, as before — this half was never wrong.
  if new.status = 'published' then
    update document set current_version_id = new.id, updated_at = now() where id = new.document_id;
  end if;

  -- Reaching the doc store. Emitted on the TRANSITION, so a later update that touches the row
  -- again — a re-publish writing a new external id, a `publish_error` being cleared — does not
  -- re-announce something that was already announced.
  if new.published_to_docs_at is not null
     and (tg_op = 'INSERT' or old.published_to_docs_at is null) then
    insert into event (org_id, engagement_id, actor_kind, actor_role_code, actor_user_id,
                       subject_type, subject_id, verb, payload)
    select d.org_id, d.engagement_id, compass_actor_kind(), compass_actor_role(), compass_actor_id(),
           'document', d.id, 'document.published',
           jsonb_build_object('path', d.path, 'version', new.version, 'url', new.external_url)
      from document d where d.id = new.document_id;
  end if;

  return new;
end;
$$ language plpgsql;

-- Recreated rather than left in place. The trigger's NAME is unchanged and `create or replace
-- function` alone would have been enough — but a trigger whose definition must change and is
-- skipped because something of the same name exists is the failure this repo has already shipped
-- once, so the binding is re-asserted explicitly.
drop trigger if exists track_current_version on document_version;
create trigger track_current_version after insert or update on document_version
  for each row execute function document_track_current_version();

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'track_current_version' and not tgisinternal
  ) then
    raise exception 'track_current_version was not recreated';
  end if;
  if not exists (
    select 1 from pg_proc p
     where p.proname = 'document_track_current_version'
       and pg_get_functiondef(p.oid) like '%published_to_docs_at is not null%'
  ) then
    raise exception 'document_track_current_version still keys on status, not on publication';
  end if;
end $$;
