# drift-hook.ts

**Path:** `apps/nakiros/src/daemon/handlers/drift-hook.ts`

IPC handler bundle for the drift hook installer. Manages the pair of Stop + UserPromptSubmit hooks that surface drift signals inside Claude Code conversations.

## IPC Channels

| Channel | Method | Description |
|---------|--------|-------------|
| `driftHook:status` | GET (poll) | Returns `DriftHookStatus` — current installation state |
| `driftHook:diff` | GET (preview) | Returns `DriftHookDiff` — `current` vs `next` `settings.json` diff |
| `driftHook:install` | POST | Idempotent install of both hooks + CJS scripts |
| `driftHook:uninstall` | POST | Idempotent removal of both hooks + CJS scripts |

All four operations are also available as REST endpoints under `/api/drift-hook/` (see `server.ts`).

## Exports

### `driftHookHandlers`

```ts
export const driftHookHandlers: HandlerRegistry
```

Handler registry object merging into the main registry via `handlers/index.ts`. Contains the four `driftHook:*` channels above.
