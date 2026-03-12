import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id'),
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

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

export const orgMembers = sqliteTable('org_members', {
  orgId: text('org_id').notNull().references(() => organizations.id),
  userId: text('user_id').notNull(),
  role: text('role').notNull().default('member'),
  joinedAt: text('joined_at').notNull(),
  email: text('email'),
}, (t) => [primaryKey({ columns: [t.orgId, t.userId] })]);

export const invitations = sqliteTable('invitations', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organizations.id),
  email: text('email').notNull(),
  role: text('role').notNull().default('member'),
  invitedBy: text('invited_by').notNull(),
  invitedAt: text('invited_at').notNull(),
});
