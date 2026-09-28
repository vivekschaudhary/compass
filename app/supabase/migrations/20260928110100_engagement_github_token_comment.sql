-- Restates 20260928100100's comment now that repo.access_token exists and wins over this column —
-- comments are metadata, not schema, so a follow-up rather than an edit to an applied file.
comment on column engagement.github_token is
  'Encrypted GitHub token, used only when the repo being written has no access_token of its own. '
  'Falls back to the server GITHUB_TOKEN below that. Write-only: its presence is reported, its '
  'value never is.';
