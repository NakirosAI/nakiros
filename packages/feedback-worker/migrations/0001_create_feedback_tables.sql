-- Nakiros Feedback — D1 migration 0001

CREATE TABLE IF NOT EXISTS feedback_sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  agent TEXT NOT NULL,
  workflow TEXT,
  editor TEXT NOT NULL,
  duration_seconds INTEGER,
  message_count INTEGER,
  conversation_key TEXT,
  conversation_shared INTEGER DEFAULT 0,
  app_version TEXT NOT NULL,
  bundle_version TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback_product (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  app_version TEXT NOT NULL,
  bundle_version TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TEXT NOT NULL
);
