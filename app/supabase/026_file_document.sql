-- 026_file_document.sql — the way source material gets into Compass.
--
-- Most documents are drafted by a job. A few are not: the SOW is the client's contract, the root
-- everything else derives from, and it enters from outside. This is that door — used by onboarding
-- when it is rebuilt, by the document editor when it exists, and by an agent publishing a draft.
--
-- WHY A ROUTINE RATHER THAN INSERTS. Each REST call is its own transaction, so an actor set by one
-- call cannot survive into the next: publishing over REST would write `document.published` with a
-- NULL actor every time. That is the same reason task transitions are routines. Filing a document
-- is one act — create it, version it, section it, publish it — and one act should be one
-- transaction, with the person who did it on the record.

create or replace function file_document(
  p_org_id        uuid,
  p_engagement_id text,
  p_path          text,
  p_title         text,
  p_sections      jsonb,                    -- [{ "heading": "...", "body": "..." }, ...]
  p_version       text default '1.0',
  p_actor         text default null,
  p_actor_role    text default null,
  p_owner_role    text default null,
  p_task_id       uuid default null          -- the job that drafted it, when a job did
) returns uuid as $$
declare
  v_doc_id     uuid;
  v_version_id uuid;
  v_section    jsonb;
  v_ord        int := 0;
begin
  perform compass_set_actor(p_actor, p_actor_role, case when p_actor is null then 'system' else 'human' end);

  if p_sections is null or jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then
    -- Refuse rather than file an empty shell. A document that exists but says nothing is worse
    -- than one that is missing: it reads as done.
    raise exception 'file_document needs at least one section. A document with no content reads as drafted when it is not.';
  end if;

  -- The document itself. Adopting an engagement's tree may already have created the node.
  select id into v_doc_id from document
   where engagement_id = p_engagement_id and path = p_path;

  if v_doc_id is null then
    insert into document (org_id, engagement_id, path, title, kind, owner_role_code)
    values (p_org_id, p_engagement_id, p_path, p_title, 'doc', p_owner_role)
    returning id into v_doc_id;
  else
    update document
       set title = coalesce(p_title, title),
           owner_role_code = coalesce(p_owner_role, owner_role_code),
           updated_at = now()
     where id = v_doc_id;
  end if;

  -- A new version, never an edit. Re-filing the same path supersedes rather than overwrites, so
  -- what a citation pointed at stays readable.
  update document_version set status = 'superseded'
   where document_id = v_doc_id and status = 'published';

  insert into document_version (document_id, version, status, created_by_task_id, published_at, published_by)
  values (v_doc_id, p_version, 'published', p_task_id, now(), p_actor)
  returning id into v_version_id;

  for v_section in select * from jsonb_array_elements(p_sections) loop
    insert into document_section (document_version_id, ord, heading, body)
    values (v_version_id, v_ord,
            coalesce(v_section->>'heading', ''),
            coalesce(v_section->>'body', ''));
    v_ord := v_ord + 1;
  end loop;

  return v_version_id;
end;
$$ language plpgsql;
