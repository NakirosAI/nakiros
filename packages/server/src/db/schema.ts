import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  data: text('data').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  projectPath: text('project_path').notNull(),
  provider: text('provider').notNull().default('claude'),
  providerProjectDir: text('provider_project_dir').notNull(),
  lastActivityAt: text('last_activity_at'),
  sessionCount: integer('session_count').notNull().default(0),
  skillCount: integer('skill_count').notNull().default(0),
  status: text('status').notNull().default('active'),
  lastScannedAt: text('last_scanned_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const collabSessions = sqliteTable('collab_sessions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  topic: text('topic').notNull(),
  status: text('status').notNull(),
  data: text('data').notNull(),
  createdAt: text('created_at').notNull(),
  resolvedAt: text('resolved_at'),
});
