export interface WorkspaceMCP {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

export interface WorkspaceDoc {
  id: string;
  label: string;
  path: string;
  type: 'file' | 'url';
}
