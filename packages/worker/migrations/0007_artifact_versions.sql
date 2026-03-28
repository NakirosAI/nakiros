CREATE TABLE artifact_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  artifact_path TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  epic_id TEXT,
  content TEXT NOT NULL,
  author TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX idx_artifact_versions_lookup ON artifact_versions(workspace_id, artifact_path, version DESC);
