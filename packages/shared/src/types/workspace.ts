export type AgentProfile =
  | 'frontend-react'
  | 'frontend-vue'
  | 'frontend-angular'
  | 'backend-node'
  | 'backend-python'
  | 'backend-rust'
  | 'backend-go'
  | 'mobile-rn'
  | 'fullstack'
  | 'generic';

export interface RepoConfig {
  name: string;
  url: string;
  role: string;
  profile: AgentProfile;
  llmDocs?: string[];
}

export interface WorkspaceConfig {
  name: string;
  repos: RepoConfig[];
  pmTool?: 'jira' | 'github' | 'gitlab' | 'linear';
  projectKey?: string;
}
