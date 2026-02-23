import type { AgentProfile } from './workspace.js';

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
}
