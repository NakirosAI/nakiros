-- Add owner to workspaces (nullable for backward compat)
-- owner_id = Clerk org_id if workspace belongs to an org, else Clerk user_id
ALTER TABLE workspaces ADD COLUMN owner_id TEXT;
