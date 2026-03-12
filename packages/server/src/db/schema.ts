import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  data: text('data').notNull(),
  updatedAt: text('updated_at').notNull(),
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
