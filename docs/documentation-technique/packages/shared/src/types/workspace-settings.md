# workspace-settings.ts

**Path:** `packages/shared/src/types/workspace-settings.ts`

Per-workspace configuration sub-types: MCP server entries and ambient doc references attached to a workspace.

## Exports

### `interface WorkspaceMCP`

User-configured MCP server entry stored inside a workspace's settings.

```ts
export interface WorkspaceMCP {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
}
```

### `interface WorkspaceDoc`

Reference to an ambient doc (local file or remote URL) attached to a workspace.

```ts
export interface WorkspaceDoc {
  id: string;
  label: string;
  path: string;
  type: 'file' | 'url';
}
```
