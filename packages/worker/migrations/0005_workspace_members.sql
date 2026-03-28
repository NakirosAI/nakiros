CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace
  ON workspace_members(workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user
  ON workspace_members(user_id);
