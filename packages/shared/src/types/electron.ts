import type { AgentProfile } from './workspace.js';
import type { WorkspaceMCP, WorkspaceDoc } from './workspace-settings.js';

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
  repos: StoredRepo[];
  pmTool?: 'jira' | 'github' | 'gitlab' | 'linear';
  projectKey?: string;
  createdAt: string;
  lastOpenedAt: string;
  mode?: 'solo' | 'connected';
  ticketPrefix?: string;
  ticketCounter?: number;
  mcps?: WorkspaceMCP[];
  projectDocs?: WorkspaceDoc[];
  documentLanguage?: string;
  branchPattern?: string;
  jiraUrl?: string;
  pmBoardId?: string;
}
