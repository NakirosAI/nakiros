import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

export const workspaceMembers = sqliteTable('workspace_members', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.userId] }),
  index('idx_workspace_members_workspace').on(table.workspaceId),
  index('idx_workspace_members_user').on(table.userId),
]);

export const providerCredentials = sqliteTable('provider_credentials', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  provider: text('provider').notNull(),
  label: text('label').notNull(),
  metadata: text('metadata').notNull(),
  secretCiphertext: text('secret_ciphertext').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  keyVersion: integer('key_version').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  revokedAt: text('revoked_at'),
}, (table) => [
  index('idx_provider_credentials_owner').on(table.ownerId),
  index('idx_provider_credentials_provider').on(table.provider),
]);

export const workspaceProviderBindings = sqliteTable('workspace_provider_bindings', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  credentialId: text('credential_id').notNull().references(() => providerCredentials.id),
  provider: text('provider').notNull(),
  isDefault: text('is_default').notNull().default('0'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_workspace_provider_binding_unique').on(table.workspaceId, table.credentialId),
  index('idx_workspace_provider_binding_workspace').on(table.workspaceId),
  index('idx_workspace_provider_binding_credential').on(table.credentialId),
  index('idx_workspace_provider_binding_provider').on(table.provider),
]);

// Epic 5: PM Data Layer

export const sprints = sqliteTable('sprints', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  goal: text('goal'),
  startDate: integer('start_date'),
  endDate: integer('end_date'),
  status: text('status').notNull().default('planning'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  index('idx_sprints_workspace').on(table.workspaceId),
]);

export const epics = sqliteTable('epics', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color'),
  status: text('status').notNull().default('backlog'),
  rank: integer('rank').notNull().default(0),
  externalId: text('external_id'),
  externalSource: text('external_source'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  index('idx_epics_workspace').on(table.workspaceId),
]);

export const stories = sqliteTable('stories', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  epicId: text('epic_id').references(() => epics.id, { onDelete: 'set null' }),
  sprintId: text('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  acceptanceCriteria: text('acceptance_criteria', { mode: 'json' }),
  status: text('status').notNull().default('backlog'),
  priority: text('priority').notNull().default('medium'),
  assignee: text('assignee'),
  storyPoints: integer('story_points'),
  rank: integer('rank').notNull().default(0),
  externalId: text('external_id'),
  externalSource: text('external_source'),
  lastSyncedAt: integer('last_synced_at'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  index('idx_stories_workspace').on(table.workspaceId),
  index('idx_stories_epic').on(table.epicId),
  index('idx_stories_sprint').on(table.sprintId),
]);

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  storyId: text('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  type: text('type').notNull().default('other'),
  status: text('status').notNull().default('todo'),
  assignee: text('assignee'),
  rank: integer('rank').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  index('idx_tasks_story').on(table.storyId),
]);

export const taskDependencies = sqliteTable('task_dependencies', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  dependsOnTaskId: text('depends_on_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
}, (table) => [
  uniqueIndex('idx_task_dependencies_unique').on(table.taskId, table.dependsOnTaskId),
]);

export const artifactVersions = sqliteTable('artifact_versions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  artifactPath: text('artifact_path').notNull(),
  artifactType: text('artifact_type').notNull(),
  epicId: text('epic_id'),
  content: text('content'),
  r2Key: text('r2_key'),
  author: text('author'),
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_artifact_versions_lookup').on(table.workspaceId, table.artifactPath, table.version),
]);

export const pmSyncLog = sqliteTable('pm_sync_log', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  provider: text('provider').notNull(),
  direction: text('direction').notNull(),
  status: text('status').notNull(),
  conflictData: text('conflict_data', { mode: 'json' }),
  syncedAt: integer('synced_at', { mode: 'timestamp' }).notNull(),
  resolvedAt: integer('resolved_at'),
}, (table) => [
  index('idx_pm_sync_log_workspace').on(table.workspaceId),
  index('idx_pm_sync_log_entity').on(table.entityId),
]);
