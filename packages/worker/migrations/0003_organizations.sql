-- Organizations table
-- org_id = generated UUID (not from melody-auth, managed in D1)
-- owner_id = melody-auth user sub (creator, always Admin)
-- slug = unique URL-friendly identifier

CREATE TABLE organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,  -- melody-auth user sub
  created_at TEXT NOT NULL
);

-- Organization memberships
-- role: 'admin' | 'member'
CREATE TABLE org_members (
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,  -- melody-auth user sub
  role       TEXT NOT NULL DEFAULT 'member',
  joined_at  TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
