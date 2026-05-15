# conversation-ingest.ts

**Path:** `apps/nakiros/src/daemon/handlers/conversation-ingest.ts`

Registers `conversationIngest:*` channels for the opt-in pipeline that captures Claude Code
sessions via a global `Stop` hook + chokidar watcher. Sessions are stored under
`~/.nakiros/ingest/projects/<encoded>/`. The UI hides synthetic projects (sandboxes, eval
iterations, Nakiros-internal workdirs) by default.

## IPC channels

- `conversationIngest:status` — returns `ConversationIngestStatus` (enabled, hookInstalled, stats, queueLength)
- `conversationIngest:previewHookDiff` — returns `ConversationIngestHookDiff` (current vs next `settings.json`)
- `conversationIngest:enable` — install hook + start watcher; returns `ConversationIngestMutationResult`
- `conversationIngest:disable` — stop watcher + uninstall hook; returns `ConversationIngestMutationResult`
- `conversationIngest:purge` — delete all ingested data under `~/.nakiros/ingest/`; returns `ConversationIngestMutationResult`
- `conversationIngest:runNow` — drain the queue + run a full scan immediately; returns `ConversationIngestMutationResult`
- `conversationIngest:listProjects` — returns `ConversationIngestProject[]` known to the ingest store
- `conversationIngest:listSessions` — returns `ConversationIngestSession[]`; filtered by `projectPath` when provided, otherwise all sessions

## Exports

### `conversationIngestHandlers`

```ts
export const conversationIngestHandlers: HandlerRegistry
```

Handler map merged into the global registry by `buildHandlerRegistry()`.
