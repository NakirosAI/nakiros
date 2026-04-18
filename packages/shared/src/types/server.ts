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
  architecture?: string;
  conventions?: string;
  entryPoints?: Record<string, string>;
  openQuestions?: string[];
  generatedAt?: string;
  updatedBy?: string;
  global?: string;
  product?: string;
  interRepo?: string;
  brainstorming?: string;
  repos?: Record<string, RepoContext>;
}
