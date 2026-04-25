# create.ts

**Path:** `apps/nakiros/src/daemon/handlers/create.ts`

Registers the `create:*` IPC channels — thin mirror of `fix:*` with different temp-workdir seeding (new skill from scratch instead of copy of an existing skill) and sync-back policy (creates a new skill on finish).

## IPC channels

### Lifecycle
- `create:start`, `create:stopRun`, `create:getRun`, `create:finish`

### Stream
- `create:sendUserMessage`, `create:listActive`, `create:getBufferedEvents`

### Diff preview
- `create:listDiff`, `create:readDiffFile`

## Broadcasts

- `create:event` — create run lifecycle.

## Exports

### `const createHandlers`

```ts
export const createHandlers: HandlerRegistry
```
