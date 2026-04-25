/** Ambient context captured for a single repo (architecture, stack, conventions, API, LLM docs). */
export interface RepoContext {
  architecture?: string;
  stack?: string;
  conventions?: string;
  api?: string;
  llms?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Ambient context for a whole workspace: shared fields at the top level plus
 * per-repo subcontexts in `repos`. Populated by the context-generation
 * workflow and consumed by agents when answering workspace-scoped prompts.
 */
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
