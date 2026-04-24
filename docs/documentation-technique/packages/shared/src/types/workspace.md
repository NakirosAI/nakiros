# workspace.ts

**Path:** `packages/shared/src/types/workspace.ts`

Workspace configuration primitives: the agent profile enum, the repo/workspace config shapes, and the canonical YAML schema persisted on disk.

## Exports

### `type AgentProfile`

Predefined agent profile used to tune prompts and tool access per repo type.

```ts
export type AgentProfile =
  | 'frontend-react' | 'frontend-vue' | 'frontend-angular'
  | 'backend-node' | 'backend-python' | 'backend-rust' | 'backend-go'
  | 'mobile-rn' | 'fullstack' | 'generic';
```

### `interface RepoConfig`

Repo entry inside a workspace config file (pre-storage shape, before `StoredRepo`).

```ts
export interface RepoConfig {
  name: string;
  url: string;
  role: string;
  profile: AgentProfile;
  llmDocs?: string[];
}
```

### `interface WorkspaceConfig`

Top-level workspace configuration loaded from the canonical YAML.

```ts
export interface WorkspaceConfig {
  name: string;
  repos: RepoConfig[];
  pmTool?: 'github' | 'gitlab' | 'linear';
  projectKey?: string;
}
```

### `type WorkspaceStructure`

Mono-repo (one repo) vs multi-repo (several repos) workspace shape.

```ts
export type WorkspaceStructure = 'mono-repo' | 'multi-repo';
```

### `interface WorkspaceYamlRepo`

Repo descriptor as serialised in the canonical `workspace.yaml`.

```ts
export interface WorkspaceYamlRepo {
  name: string;
  role: string;
  localPath: string;
  profile: AgentProfile;
}
```

### `interface CanonicalWorkspaceYaml`

Canonical YAML schema for a workspace descriptor persisted on disk.

```ts
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
```
