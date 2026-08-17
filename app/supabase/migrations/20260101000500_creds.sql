-- 005_creds.sql — per-engagement credentials (multi-client delivery: each engagement can point
-- at a different client's Atlassian site / Microsoft tenant). Run in the Supabase SQL editor.
-- NOTE: for a real deployment these secret columns should be encrypted at rest / held in a vault.
-- They are write-only in the app: the API never returns the secret values to the browser.

-- Confluence / Atlassian (per engagement; falls back to the server .env if left blank)
alter table engagement add column if not exists atlassian_base_url text;
alter table engagement add column if not exists atlassian_email text;
alter table engagement add column if not exists atlassian_api_token text;   -- secret (write-only)

-- Microsoft Graph (Teams / SharePoint) — Azure AD app per engagement
alter table engagement add column if not exists graph_tenant_id text;
alter table engagement add column if not exists graph_client_id text;
alter table engagement add column if not exists graph_client_secret text;   -- secret (write-only)
