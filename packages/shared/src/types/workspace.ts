/** Predefined agent profile used to tune prompts and tool access per repo type. */
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

/** Repo entry inside a workspace config file (pre-storage shape, before {@link StoredRepo}). */
export interface RepoConfig {
  name: string;
  url: string;
  role: string;
  profile: AgentProfile;
  llmDocs?: string[];
}

/** Top-level workspace configuration loaded from the canonical YAML. */
export interface WorkspaceConfig {
  name: string;
  repos: RepoConfig[];
  pmTool?: 'github' | 'gitlab' | 'linear';
  projectKey?: string;
}

/** Mono-repo (one repo) vs multi-repo (several repos) workspace shape. */
export type WorkspaceStructure = 'mono-repo' | 'multi-repo';

/** Repo descriptor as serialised in the canonical `workspace.yaml`. */
export interface WorkspaceYamlRepo {
  name: string;
  role: string;
  localPath: string;
  profile: AgentProfile;
}


/** Canonical YAML schema for a workspace descriptor persisted on disk. */
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
