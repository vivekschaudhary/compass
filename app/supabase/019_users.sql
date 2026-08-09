-- 019_users.sql — identity and role grants.
--
-- STRUCTURE ONLY. There is no authentication in the app yet: `actor` is a free-text string the
-- client asserts, and nothing verifies it. These tables give that a place to land so the shape
-- doesn't have to be retrofitted through every write path later — and so `canEditOrgDefaults`
-- has something real to read the day a login exists. Declared, not implemented.
--
-- Why this is separate from `member`: `member` is the engagement ROSTER — one row per role slot,
-- optionally carrying a person's name, and a small team already models "one person, many roles"
-- by having several rows with the same name. What it cannot express is that those rows are ONE
-- HUMAN who signs in. That is identity, and it is org-scoped rather than engagement-scoped.

create table if not exists app_user (
  id           text primary key,                    -- later: the auth provider's subject claim
  org_id       text not null default 'default',
  email        text not null,
  name         text,
  status       text not null default 'active',      -- active | invited | disabled
  created_at   timestamptz default now(),
  last_seen_at timestamptz
);

-- One account per email per org; case-insensitive, because people type their address both ways.
create unique index if not exists app_user_email_org on app_user(org_id, lower(email));

-- Role GRANTS — deliberately many-to-many. A small team is the normal case, not the edge case:
-- one person may hold every role at once, so this is a row per (user, role, scope) rather than a
-- `role` column on the user. A NULL engagement_id is an ORG-WIDE grant; a set one scopes the
-- grant to a single engagement.
create table if not exists user_role (
  id            bigserial primary key,
  user_id       text not null references app_user(id) on delete cascade,
  role          text not null,                      -- a delivery role code, or a platform role
  engagement_id text references engagement(id) on delete cascade,   -- null = org-wide
  granted_at    timestamptz default now(),
  granted_by    text,
  -- `nulls not distinct` so a second org-wide grant of the same role collides rather than
  -- silently duplicating — without it every NULL engagement_id counts as unique.
  unique nulls not distinct (user_id, role, engagement_id)
);

create index if not exists user_role_lookup on user_role(user_id, engagement_id);

-- Connect the roster to identity, optionally. A roster slot may legitimately have NO user: it can
-- be an unfilled position, or a role played by an agent rather than a person. `set null` because
-- deleting a person must not erase the delivery history of the slot they held.
alter table member add column if not exists user_id text references app_user(id) on delete set null;
