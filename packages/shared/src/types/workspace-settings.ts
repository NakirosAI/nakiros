/** User-configured MCP server entry stored inside a workspace's settings. */
export interface WorkspaceMCP {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}

/** Reference to an ambient doc (local file or remote URL) attached to a workspace. */
export interface WorkspaceDoc {
  id: string;
  label: string;
  path: string;
  type: 'file' | 'url';
}
