# agent-installer.ts

**Path:** `apps/nakiros/src/services/agent-installer.ts`

Copies Nakiros command templates (from `~/.nakiros/commands/`) into per-editor target dirs — either globally (`~/.claude/commands/`, `~/.cursor/commands/`, `~/.codex/prompts/`) or inside a specific repo. Backs the `agents:*` IPC channels.

## Exports

### `const COMMANDS_META_FILE`

Path to the per-command metadata file (`tag` / `label` / `color` overrides).

```ts
export const COMMANDS_META_FILE: string
```

### `interface CommandMeta`

UI metadata for a single installed command (optional labelling + colour).

```ts
export interface CommandMeta {
  tag?: string;
  label?: string;
  color?: string;
  placeholder?: string;
}
```

### `interface GlobalInstallStatus`

Aggregate install status for the user-global environments (`~/.claude`, `~/.cursor`, `~/.codex`).

### `interface InstalledCommand`

Runtime descriptor for one Nakiros command currently under `~/.nakiros/commands/`. Parsed from filename pattern `nak-(agent|workflow)-<id>.md`.

### `function getInstalledCommands`

List every `nak-agent-*` / `nak-workflow-*` command currently under `~/.nakiros/commands/`, merged with the per-command metadata file.

```ts
export function getInstalledCommands(): InstalledCommand[]
```

### `interface GlobalInstallSummary`

Return value of `installAgentsGlobally` — files copied vs overwritten per environment.

### `function installAgentsGlobally`

Install every Nakiros command template into the user-global target dirs for Claude Code, Codex, and Cursor. Always overwrites.

```ts
export function installAgentsGlobally(): GlobalInstallSummary
```

### `function installAgents`

Install Nakiros command templates into selected environments for one repo. Respects `request.force` (defaults to `true`).

```ts
export function installAgents(request: AgentInstallRequest): AgentInstallSummary
```

**Throws:** `Error` — when the repo path is invalid or no targets are selected.

### `function getGlobalInstallStatus`

Compute user-global install status by counting installed command files per environment.

```ts
export function getGlobalInstallStatus(): GlobalInstallStatus
```

### `function getAgentInstallStatus`

Compute per-repo install status across every environment (marker presence + command file count).

```ts
export function getAgentInstallStatus(repoPath: string): AgentInstallStatus
```
