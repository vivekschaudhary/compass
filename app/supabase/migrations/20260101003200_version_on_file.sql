-- 032_version_on_file.sql — the routine numbers the version, not the caller.
--
-- 026 defaulted `p_version` to '1.0', so every re-file collided on
-- (document_id, version) the moment a document had been filed once. An agent that redrafted lost
-- its work at the last step, after the model had already run.
--
-- Hand-picking a version number at the call site was the mistake. Versions are a property of the
-- document's history, and the only place that knows the history is the database — so it derives the
-- next one. Passing an explicit version still works, for an import that carries its own numbering.

create or replace function file_document(
  p_org_id        uuid,
  p_engagement_id text,
  p_path          text,
  p_title         text,
  p_sections      jsonb,
  p_version       text default null,          -- null = derive the next one
  p_actor         text default null,
  p_actor_role    text default null,
  p_owner_role    text default null,
  p_task_id       uuid default null
) returns uuid as $$
declare
  v_doc_id     uuid;
  v_version_id uuid;
  v_version    text;
  v_section    jsonb;
  v_ord        int := 0;
begin
  perform compass_set_actor(p_actor, p_actor_role, case when p_actor is null then 'system' else 'human' end);

  if p_sections is null or jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then
    raise exception 'file_document needs at least one section. A document with no content reads as drafted when it is not.';
  end if;

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

  -- Next major version. Deliberately simple: versions here mark "a new draft was filed", and a
  -- scheme that carried more meaning than that would be claiming to know whether a change was
  -- substantive, which nothing in this routine can tell.
  if p_version is null then
    select coalesce(max(split_part(version, '.', 1)::int), 0) + 1 || '.0'
      into v_version
      from document_version
     where document_id = v_doc_id and version ~ '^[0-9]+\.';
  else
    v_version := p_version;
  end if;

  update document_version set status = 'superseded'
   where document_id = v_doc_id and status = 'published';

  insert into document_version (document_id, version, status, created_by_task_id, published_at, published_by)
  values (v_doc_id, v_version, 'published', p_task_id, now(), p_actor)
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
