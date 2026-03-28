-- Migration: 0006_pm_data_layer
-- Epic 5: PM Data Layer — Sprint, Epic, Story, Task, Dependencies, Sync Log

CREATE TABLE sprints (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT,
  start_date INTEGER,
  end_date INTEGER,
  status TEXT NOT NULL DEFAULT 'planning',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_sprints_workspace ON sprints(workspace_id);

CREATE TABLE epics (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'backlog',
  rank INTEGER NOT NULL DEFAULT 0,
  external_id TEXT,
  external_source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_epics_workspace ON epics(workspace_id);

CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
  sprint_id TEXT REFERENCES sprints(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  acceptance_criteria TEXT,
  status TEXT NOT NULL DEFAULT 'backlog',
  priority TEXT NOT NULL DEFAULT 'medium',
  assignee TEXT,
  story_points INTEGER,
  rank INTEGER NOT NULL DEFAULT 0,
  external_id TEXT,
  external_source TEXT,
  last_synced_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_stories_workspace ON stories(workspace_id);
CREATE INDEX idx_stories_epic ON stories(epic_id);
CREATE INDEX idx_stories_sprint ON stories(sprint_id);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'todo',
  assignee TEXT,
  rank INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_tasks_story ON tasks(story_id);

CREATE TABLE task_dependencies (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(task_id, depends_on_task_id)
);

CREATE TABLE pm_sync_log (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  conflict_data TEXT,
  synced_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX idx_pm_sync_log_workspace ON pm_sync_log(workspace_id);
CREATE INDEX idx_pm_sync_log_entity ON pm_sync_log(entity_id);
