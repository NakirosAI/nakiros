# agent-cli.ts

**Path:** `apps/nakiros/src/services/agent-cli.ts`

Detects whether the `claude`, `codex`, and `cursor-agent` CLIs are installed and responsive. Backs the `agents:cli-status` IPC channel. Works around shells that don't inherit the user's full PATH by probing with `command -v` inside a login shell and by augmenting PATH with common Node version-manager locations (nvm, fnm, volta, asdf, bun, homebrew).

## Exports

### `interface AgentCliStatus`

Install status for one agent CLI. `path` and `version` populate when the binary is on PATH and responds to `--version`. `error` carries `not_found` or the underlying shell error.

```ts
export interface AgentCliStatus {
  provider: AgentProvider;
  label: string;
  command: string;
  installed: boolean;
  path?: string;
  version?: string;
  error?: string;
}
```

### `function getAgentCliStatus`

Probe every supported provider. Returns one `AgentCliStatus` per provider, in a fixed order.

```ts
export function getAgentCliStatus(): AgentCliStatus[]
```
