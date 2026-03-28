// Subset of @nakiros/shared types — kept in sync manually.
// Using a local copy avoids bundling the full shared package into the Worker.

export interface RepoConfig {
  name: string;
  localPath: string;
  role?: string;
  profile?: string;
  llmDocs?: string[];
  url?: string;
}

export interface RepoContext {
  architecture?: string;
  stack?: string;
  conventions?: string;
  api?: string;
  llms?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface WorkspaceContext {
  global?: string;
  product?: string;
  interRepo?: string;
  repos?: Record<string, RepoContext>;
  generatedAt?: string;
  updatedBy?: string;
  // legacy fields kept for backward compat
  architecture?: string;
  conventions?: string;
  entryPoints?: Record<string, string>;
  openQuestions?: string[];
  brainstorming?: string;
}

export interface StoredWorkspace {
  id: string;
  name: string;
  ownerId?: string;
  repos: RepoConfig[];
  pmTool?: string;
  projectKey?: string;
  pmBoardId?: string;
  boardType?: string;
  syncFilter?: string;
  topology?: 'mono' | 'multi';
  branchPattern?: string;
  documentLanguage?: string;
  workspacePath?: string;
  context?: WorkspaceContext;
}

export interface CollabMessage {
  id: string;
  agentRole: string;
  model?: string;
  content: string;
  respondingTo?: string;
  postedAt: string;
}

export interface CollabSession {
  id: string;
  workspaceId: string;
  topic: string;
  status: 'open' | 'resolved';
  messages: CollabMessage[];
  synthesis?: string;
  createdAt: string;
  resolvedAt?: string;
}

// ─── PM Data Layer Types (Epic 5) ────────────────────────────────────────────

export interface SprintRow {
  id: string;
  workspaceId: string;
  name: string;
  goal: string | null;
  startDate: number | null; // Unix timestamp ms
  endDate: number | null;
  status: 'planning' | 'active' | 'completed';
  createdAt: number;
  updatedAt: number;
}

export interface EpicRow {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  color: string | null;
  status: 'backlog' | 'in_progress' | 'done';
  rank: number;
  externalId: string | null;
  externalSource: 'jira' | 'linear' | 'github' | 'gitlab' | null;
  createdAt: number;
  updatedAt: number;
}

export interface StoryRow {
  id: string;
  workspaceId: string;
  epicId: string | null;
  sprintId: string | null; // null = backlog
  title: string;
  description: string | null;
  acceptanceCriteria: string[] | null;
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignee: string | null;
  storyPoints: number | null;
  rank: number;
  externalId: string | null;
  externalSource: 'jira' | 'linear' | 'github' | 'gitlab' | null;
  lastSyncedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TaskRow {
  id: string;
  storyId: string;
  title: string;
  description: string | null;
  type: 'backend' | 'frontend' | 'test' | 'other';
  status: 'todo' | 'in_progress' | 'done';
  assignee: string | null;
  rank: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskDependencyRow {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
}

export interface PmSyncLogRow {
  id: string;
  workspaceId: string;
  entityType: 'epic' | 'story' | 'task';
  entityId: string;
  provider: 'jira' | 'linear' | 'github' | 'gitlab';
  direction: 'import' | 'push';
  status: 'success' | 'conflict' | 'error' | 'resolved';
  conflictData?: unknown;
  syncedAt: number; // Unix ms
  resolvedAt?: number | null;
}

export interface StoryFilters {
  epicId?: string | null;
  sprintId?: string | null;
  backlog?: boolean;
}

export interface CreateSprintBody {
  name: string;
  goal?: string;
  startDate?: number;
  endDate?: number;
}

export interface UpdateSprintBody {
  name?: string;
  goal?: string | null;
  startDate?: number | null;
  endDate?: number | null;
  status?: SprintRow['status'];
}

export interface CreateEpicBody {
  name: string;
  description?: string;
  color?: string;
  rank?: number;
}

export interface UpdateEpicBody {
  name?: string;
  description?: string | null;
  color?: string | null;
  status?: EpicRow['status'];
  rank?: number;
}

export interface CreateStoryBody {
  title: string;
  epicId?: string;
  sprintId?: string;
  description?: string;
  acceptanceCriteria?: string[];
  status?: StoryRow['status'];
  priority?: StoryRow['priority'];
  assignee?: string;
  storyPoints?: number;
  rank?: number;
}

export interface UpdateStoryBody {
  title?: string;
  epicId?: string | null;
  sprintId?: string | null; // null = move to backlog
  description?: string | null;
  acceptanceCriteria?: string[] | null;
  status?: StoryRow['status'];
  priority?: StoryRow['priority'];
  assignee?: string | null;
  storyPoints?: number | null;
  rank?: number;
}

export interface CreateTaskBody {
  title: string;
  description?: string;
  type?: TaskRow['type'];
  assignee?: string;
  rank?: number;
}

export interface UpdateTaskBody {
  title?: string;
  description?: string | null;
  type?: TaskRow['type'];
  status?: TaskRow['status'];
  assignee?: string | null;
  rank?: number;
}

// ─── Artifact Versioning ─────────────────────────────────────────────────────

export type ArtifactType = 'prd' | 'feature-spec' | 'ux-design' | 'architecture' | 'story' | 'sprint';

export interface ArtifactVersionRow {
  id: string;
  workspaceId: string;
  artifactPath: string;
  artifactType: ArtifactType;
  epicId: string | null;
  content: string | null;
  r2Key: string | null;
  author: string | null;
  version: number;
  createdAt: number;
}

export interface SaveArtifactVersionBody {
  artifactPath: string;
  artifactType: ArtifactType;
  epicId?: string | null;
  content: string;
  author?: string;
}
