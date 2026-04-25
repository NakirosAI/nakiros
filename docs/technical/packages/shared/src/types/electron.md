# electron.ts

**Path:** `packages/shared/src/types/electron.ts`

Skill-command installer status + request types. Despite the historical filename, these types drive the `agents:*` installer IPC channels (not Electron-specific).

## Exports

### `type AgentEnvironmentId`

Supported editor/agent integrations the Nakiros skill-command installer targets.

```ts
export type AgentEnvironmentId = 'cursor' | 'codex' | 'claude';
```

### `interface AgentEnvironmentStatus`

Install status for one environment in a single repo (marker presence + command counts).

```ts
export interface AgentEnvironmentStatus {
  id: AgentEnvironmentId;
  label: string;
  targetPath: string;
  markerExists: boolean;
  installedCount: number;
  totalExpected: number;
}
```

### `interface AgentInstallStatus`

Aggregate install status across every environment for one repo.

```ts
export interface AgentInstallStatus {
  repoPath: string;
  environments: AgentEnvironmentStatus[];
}
```

### `interface AgentInstallRequest`

Request payload for the installer IPC call — target repo + environments.

```ts
export interface AgentInstallRequest {
  repoPath: string;
  targets: AgentEnvironmentId[];
  force?: boolean;
}
```

### `interface AgentInstallSummary`

Summary of what the installer actually wrote / overwrote on disk after a run.

```ts
export interface AgentInstallSummary {
  repoPath: string;
  targets: AgentEnvironmentId[];
  commandFilesCopied: number;
  commandFilesOverwritten: number;
  runtimeFilesCopied: number;
  runtimeFilesOverwritten: number;
  workspaceDirsCreated: number;
  gitignorePatched: boolean;
}
```
