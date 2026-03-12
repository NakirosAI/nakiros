-- Add email to org_members (populated when user joins via invitation, for display)
ALTER TABLE org_members ADD COLUMN email TEXT;

-- Pending invitations (admin invites by email; auto-accepted on next sign-in)
CREATE TABLE invitations (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member',
  invited_by TEXT NOT NULL,
  invited_at TEXT NOT NULL,
  UNIQUE(org_id, email)
);
