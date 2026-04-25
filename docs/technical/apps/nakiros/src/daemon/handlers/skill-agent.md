# skill-agent.ts

**Path:** `apps/nakiros/src/daemon/handlers/skill-agent.ts`

Registers the `skillAgent:*` IPC channels — shared draft-file surface for the fix + create runners. Reads files from the run's temp workdir, hiding Nakiros-internal runtime paths (`.claude/`, `run.json`, `evals/workspace/`) so the UI never surfaces them to the user.

## IPC channels

- `skillAgent:listTempFiles` — walks the temp workdir and returns user-facing draft files (metadata only)
- `skillAgent:readTempFile` — returns one of `{ kind: 'text' | 'image' | 'binary' | 'missing' }`:
  - images (whitelisted MIME types) are returned as `data:` URLs
  - text files under 1 MB are returned as UTF-8 content
  - anything larger is surfaced as `binary` with `sizeBytes` only
  - paths that escape the temp workdir or match the hidden list return `missing`

## Exports

### `const skillAgentHandlers`

```ts
export const skillAgentHandlers: HandlerRegistry
```
