# agents.ts

**Path:** `apps/nakiros/src/daemon/handlers/agents.ts`

Registers the `agents:*` IPC channels — skill-command installer status and actions (per-repo + user-global).

## IPC channels

- `agents:status` — install status for a given repo across every supported environment
- `agents:global-status` — install status for the user-global (`~/.claude`) environment
- `agents:installed-commands` — list of Nakiros commands currently installed
- `agents:cli-status` — checks whether the `claude` / `cursor` / `codex` CLIs are on PATH
- `agents:install` — installs Nakiros commands into the selected environments for one repo
- `agents:install-global` — installs into the user-global environment

## Exports

### `const agentsHandlers`

```ts
export const agentsHandlers: HandlerRegistry
```
