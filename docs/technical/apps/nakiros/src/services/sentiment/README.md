# sentiment/

**Path:** `apps/nakiros/src/services/sentiment/`

Local sentiment pre-pass service. Scores user messages from ingested Claude Code sessions using a local ONNX multilingual distilbert model (`@xenova/transformers`). The service is self-contained — no IPC, no ingest coupling in Batch B. Phase 4 wires it into the ingest pipeline. Output (`SentimentTrace`) is stored under `~/.nakiros/ingest/projects/<encoded>/sentiment/<sessionId>.json`.

## Files

- [index.ts](./index.ts.md) — Public façade: `warmupSentiment`, `scoreText`, `scoreBatch` + re-exports of model ID, skip predicate, path helpers.
- [paths.ts](./paths.ts.md) — Filesystem layout: `getModelsDir`, `getProjectSentimentDir`, `getSentimentTracePath`.
- [pipeline.ts](./pipeline.ts.md) — Singleton `@xenova/transformers` pipeline loader with deduped warm-up promise.
- [sentiment-store.ts](./sentiment-store.ts.md) — Atomic load/persist of `SentimentTrace` JSON files.
- [skip-rules.ts](./skip-rules.ts.md) — Predicate that excludes code pastes and symbol-heavy messages from scoring.
