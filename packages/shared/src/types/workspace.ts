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
  pmTool?: 'github' | 'gitlab' | 'linear';
  projectKey?: string;
}

export type WorkspaceStructure = 'mono-repo' | 'multi-repo';

export interface WorkspaceYamlRepo {
  name: string;
  role: string;
  localPath: string;
  profile: AgentProfile;
}


export interface CanonicalWorkspaceYaml {
  name: string;
  slug: string;
  structure: WorkspaceStructure;
  repos: WorkspaceYamlRepo[];
  pmTool?: 'github' | 'gitlab' | 'linear';
  projectKey?: string;
  documentLanguage?: string;
  branchPattern?: string;
  pmBoardId?: string;
}
