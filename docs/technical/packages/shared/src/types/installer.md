# installer.ts

**Path:** `packages/shared/src/types/installer.ts`

Persisted workspace record types (stored under `~/.nakiros/`). Holds the repo list, optional PM tool integration, workspace-level docs, MCP servers, and rendered workspace context.

## Exports

### `interface StoredRepo`

Persisted repo entry inside a `StoredWorkspace`.

```ts
export interface StoredRepo {
  name: string;
  localPath: string;
  url?: string;
  role: string;
  profile: AgentProfile;
  llmDocs: string[];
}
```

### `interface StoredWorkspace`

Workspace record persisted on disk. Holds the repos, optional PM tool integration, workspace-level docs, MCPs, and rendered workspace context.

```ts
export interface StoredWorkspace {
  id: string;
  name: string;
  workspacePath?: string;
  repos: StoredRepo[];
  pmTool?: 'github' | 'gitlab' | 'linear';
  projectKey?: string;
  createdAt: string;
  lastOpenedAt: string;
  topology?: 'mono' | 'multi';
  ticketPrefix?: string;
  ticketCounter?: number;
  mcps?: WorkspaceMCP[];
  projectDocs?: WorkspaceDoc[];
  documentLanguage?: string;
  branchPattern?: string;
  pmBoardId?: string;
  context?: WorkspaceContext;
}
```
