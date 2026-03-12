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
}

export interface WorkspaceContext {
  global?: string;
  product?: string;
  interRepo?: string;
  repos?: Record<string, RepoContext>;
  // legacy fields kept for backward compat
  architecture?: string;
  conventions?: string;
  entryPoints?: Record<string, string>;
  openQuestions?: string[];
  generatedAt?: string;
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
