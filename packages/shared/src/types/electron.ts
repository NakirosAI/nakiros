import type { AgentProfile } from './workspace.js';
import type { WorkspaceMCP, WorkspaceDoc } from './workspace-settings.js';
import type { WorkspaceContext } from './server.js';

export interface StoredRepo {
  name: string;
  localPath: string;
  url?: string;
  role: string;
  profile: AgentProfile;
  llmDocs: string[];
}

export interface StoredWorkspace {
  id: string;
  name: string;
  workspacePath?: string;
  repos: StoredRepo[];
  pmTool?: 'jira' | 'github' | 'gitlab' | 'linear';
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
  jiraUrl?: string;
  pmBoardId?: string;
  jiraConnected?: boolean;
  jiraCloudId?: string;
  jiraCloudUrl?: string;
  context?: WorkspaceContext;
}
