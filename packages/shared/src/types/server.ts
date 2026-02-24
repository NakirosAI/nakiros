export interface WorkspaceContext {
  architecture?: string;
  conventions?: string;
  entryPoints?: Record<string, string>;
  openQuestions?: string[];
  generatedAt?: string;
}
