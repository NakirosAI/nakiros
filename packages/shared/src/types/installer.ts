import type { AgentProfile } from './workspace.js';
import type { WorkspaceMCP, WorkspaceDoc } from './workspace-settings.js';
import type { WorkspaceContext } from './server.js';

/** Persisted repo entry inside a {@link StoredWorkspace}. */
export interface StoredRepo {
  name: string;
  localPath: string;
  url?: string;
  role: string;
  profile: AgentProfile;
  llmDocs: string[];
}

/**
 * Workspace record persisted on disk (under `~/.nakiros/`). Holds the repos,
 * optional PM tool integration, workspace-level docs, MCPs, and rendered
 * workspace context.
 */
export interface StoredWorkspace {
  id: string;
  name: string;
  workspacePath?: string;
  repos: StoredRepo[];
  pmTool?: 'github' | 'gitlab' | 'linear';
  projectKey?: string;
  createdAt: string;
  lastOpenedAt: string;
  topology?: 'mono' | 'multi';
  ticketPrefix?: string;
  ticketCounter?: number;
  mcps?: WorkspaceMCP[];
  projectDocs?: WorkspaceDoc[];
  documentLanguage?: string;
  branchPattern?: string;
  pmBoardId?: string;
  context?: WorkspaceContext;
}
