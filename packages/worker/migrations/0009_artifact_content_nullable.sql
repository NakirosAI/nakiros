-- SQLite cannot ALTER COLUMN to drop NOT NULL, so recreate the table.
-- This makes `content` nullable so artifacts stored in R2 don't need inline content.

PRAGMA foreign_keys = OFF;

CREATE TABLE artifact_versions_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  artifact_path TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  epic_id TEXT,
  content TEXT,
  r2_key TEXT,
  author TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

INSERT INTO artifact_versions_new
  SELECT id, workspace_id, artifact_path, artifact_type, epic_id, content, r2_key, author, version, created_at
  FROM artifact_versions;

DROP TABLE artifact_versions;
ALTER TABLE artifact_versions_new RENAME TO artifact_versions;

PRAGMA foreign_keys = ON;
