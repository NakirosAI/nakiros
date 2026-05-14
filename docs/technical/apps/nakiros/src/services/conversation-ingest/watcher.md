# watcher

**Path:** `apps/nakiros/src/services/conversation-ingest/watcher.ts`

Boot-time and live ingest queue handler. Uses chokidar to watch `~/.nakiros/ingest/queue/` and triggers `drainQueue()` every time a new file lands (the hook script writes one file per Stop event). Idempotent and lazily started — multiple `startWatcher()` calls are no-ops.

## Exports

### `startWatcher`

```ts
export function startWatcher(): void
```

Start the chokidar watcher on `~/.nakiros/ingest/queue/`. Immediately triggers an initial drain so any queue files left from a previous daemon shutdown are picked up. Subsequent calls are no-ops if the watcher is already running.

### `stopWatcher`

```ts
export function stopWatcher(): void
```

Tear down the chokidar watcher. No-op if the watcher is not running. Called by `disableConversationIngest` IPC handler.

### `isWatcherRunning`

```ts
export function isWatcherRunning(): boolean
```

Returns whether the chokidar queue watcher is currently active.
