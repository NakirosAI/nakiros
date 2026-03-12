-- Nakiros API - D1 initial schema

CREATE TABLE IF NOT EXISTS workspaces (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  data       TEXT NOT NULL,   -- JSON-serialised StoredWorkspace
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collab_sessions (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  topic        TEXT NOT NULL,
  status       TEXT NOT NULL, -- 'open' | 'resolved'
  data         TEXT NOT NULL, -- JSON-serialised CollabSession
  created_at   TEXT NOT NULL,
  resolved_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_collab_workspace ON collab_sessions(workspace_id);
