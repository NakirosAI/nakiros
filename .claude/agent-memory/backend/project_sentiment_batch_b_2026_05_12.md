---
name: project_sentiment_batch_b_2026_05_12
description: Sentiment pre-pass Batch B (Phase 3) shipped 2026-05-12 — 6 modules production-grade
metadata:
  type: project
---

Sentiment pre-pass Batch B shipped 2026-05-12. 6 new files:
- `packages/shared/src/types/sentiment.ts` — SentimentLabel/SentimentEntry/SentimentTrace/SentimentTraceStatus
- `apps/nakiros/src/services/sentiment/paths.ts` — getModelsDir/getProjectSentimentDir/getSentimentTracePath
- `apps/nakiros/src/services/sentiment/skip-rules.ts` — shouldSkipForSentiment
- `apps/nakiros/src/services/sentiment/pipeline.ts` — getSentimentPipeline singleton (TextClassificationPipeline)
- `apps/nakiros/src/services/sentiment/index.ts` — warmupSentiment/scoreText/scoreBatch façade
- `apps/nakiros/src/services/sentiment/sentiment-store.ts` — loadSentimentTrace/persistSentimentTrace (atomic)

**KEY GOTCHA**: `@xenova/transformers` pipeline() return type is `TextClassificationOutput | TextClassificationOutput[]` where `TextClassificationOutput = TextClassificationSingle[]`. When passing a single string, runtime returns `TextClassificationSingle[]`. Cast via `as unknown as TextClassificationSingle[]` in scoreText. Do NOT try to use `Awaited<ReturnType<typeof pipeline>>` — that's the full union and `label`/`score` don't resolve.

**KEY GOTCHA**: Use `type TextClassificationPipeline` import (not `Pipeline`) in pipeline.ts — `Pipeline` exists but `TextClassificationPipeline` is the right narrowed type. Cast result of `pipeline()` call with `as TextClassificationPipeline`.

Shared types re-exported via `packages/shared/src/index.ts` line: `export * from './types/sentiment.js';` (added after `conversation-ingest.js`).

Phase 4 (Batch C) will wire into ingest pipeline — no existing files modified in Batch B.

**Why:** isolated module work, no integration yet, all imports use @nakiros/shared + .js ESM suffixes.
**How to apply:** Phase 4 imports from `../../services/sentiment/index.js` in the ingest runner.
