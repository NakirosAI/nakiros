# index

**Path:** `apps/nakiros/src/services/conversation-ingest/index.ts`

Conversation-ingest service barrel — daemon-side hooks needed to enable / disable / inspect the opt-in pipeline that captures Claude Code session JSONL files into `~/.nakiros/ingest/projects/<encoded>/`. V1.0 stores raw turns + a per-project index. V1.1 adds a Haiku classifier on top. V1.2 ships sentiment pre-pass scoring.

## Re-exports

- `installHook`, `uninstallHook`, `isHookInstalled`, `previewHookDiff` — see [hook-installer.md](./hook-installer.md)
- `drainQueue`, `ensureProjectIndexed`, `ensureCoworkProjectIndexed`, `fullScan`, `ingestSession`, `getQueueLength`, `aggregateStats` — see [runner.md](./runner.md)
- `startWatcher`, `stopWatcher`, `isWatcherRunning` — see [watcher.md](./watcher.md)
- `listProjects`, `listSessionsForProject`, `listAllSessions`, `purgeIngestData`, `readSessionBody`, `toProjectConversation`, `getSessionTranscriptDir` — see [project-store.md](./project-store.md)
- `getIngestHookScriptPath`, `getClaudeGlobalSettingsPath` — see [paths.md](./paths.md)
- `loadDigest`, `listDigestsForProject`, `persistDigest` — see [classifier.md](./classifier.md)
- `buildConversationDigest`, `estimateDigestTokens` — see [digest-builder.md](./digest-builder.md)
- `parseClassifierJson` — see [classifier-parser.md](./classifier-parser.md)
