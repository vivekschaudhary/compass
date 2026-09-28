-- The GitHub credential a scaffold (or a later build/fix) writes THIS repo with.
--
-- Per repo, not per engagement: `engagement.github_token` (added just before this file) assumed one
-- GitHub org per client, and that stopped holding the moment a client's repos span more than one org
-- or need scopes narrower than one shared token can express. A repo's own token wins; the
-- engagement's is the fallback for the common case where one token really does cover every repo, so
-- an operator with one org need not paste the same token N times.

alter table repo add column if not exists access_token text;   -- secret (write-only)

comment on column repo.access_token is
  'Encrypted GitHub token for THIS repo. Wins over engagement.github_token, which wins over the '
  'server GITHUB_TOKEN. Write-only: its presence is reported, its value never is.';

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'repo' and column_name = 'access_token') then
    raise exception 'did not add repo.access_token';
  end if;
end $$;
