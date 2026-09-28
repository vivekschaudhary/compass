-- The credential the app uses to write a scaffold into a repo through the GitHub API.
--
-- Per engagement, like the Atlassian and Graph credentials beside it: a control tower runs many
-- clients and each may point at its own GitHub org. Stored encrypted (`crypto.ts`) and never read
-- back to a browser; the resolver falls back to the server's GITHUB_TOKEN, so a solo operator on
-- one org need not paste a token per engagement.
--
-- A fine-grained token needs, on the repos it will write: Contents (read and write) and Pull
-- requests (read and write), and Checks (read) for the CI gate. Administration is needed only if the
-- app is ever to CREATE repos, which it does not do yet.

alter table engagement add column if not exists github_token text;   -- secret (write-only)

comment on column engagement.github_token is
  'Encrypted GitHub token the app writes scaffolds with. Write-only: its presence is reported, its value never is.';

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'engagement' and column_name = 'github_token') then
    raise exception 'did not add engagement.github_token';
  end if;
end $$;
