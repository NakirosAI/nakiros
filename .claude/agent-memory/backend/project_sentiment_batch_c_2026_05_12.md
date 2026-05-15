---
name: project_sentiment_batch_c_2026_05_12
description: Sentiment pre-pass Batch C (Phase 4) shipped 2026-05-12 — ingest integration + IPC handler
metadata:
  type: project
---

Sentiment pre-pass Batch C shipped 2026-05-12 (commits `3ba99be` + `c611fb0`).

**Task 4.1 — ingestSession integration** (`apps/nakiros/src/services/conversation-ingest/runner.ts`):
- `ingestSession` remains synchronous; sentiment scoring fires in a `void (async () => {...})()` IIFE background after `upsertSession(meta)`.
- Guard: `if (kind === 'user')` — synthetic sessions skipped.
- Idempotence: loads existing trace, compares `transcriptMtime`, skips if unchanged.
- Insertion point: lines 280–317 (after `upsertSession(meta);`, before `return { sessionId, ok: true }`).
- Imports added: `scoreBatch, SENTIMENT_MODEL_ID` from `../sentiment/index.js`, `loadSentimentTrace, persistSentimentTrace` from `../sentiment/sentiment-store.js`.

**KEY GOTCHA for IIFE pattern**: In standalone scripts, the Node process may exit before the IIFE fires. Works correctly in the daemon (long-lived process). Smoke test must keep the event loop alive (poll via `setTimeout` in a loop) to observe the result.

**Task 4.2 — IPC channel `sentiment:getTrace`**:
- `packages/shared/src/ipc-channels.ts` — channel added before `classifyConvo:*` block.
- `apps/nakiros/src/daemon/handlers/sentiment.ts` — new handler using `createTypedHandler` pattern. Exports `sentimentHandlers: HandlerRegistry`.
- `apps/nakiros/src/daemon/handlers/index.ts` — `sentimentHandlers` imported and spread into `buildHandlerRegistry()`.
- `apps/frontend/src/lib/nakiros-client.ts` — `getSentimentTrace(projectPath, sessionId)` method added at end of client object.
- `apps/frontend/src/global.d.ts` — `SentimentTrace` import added, `getSentimentTrace` method declared on `window.nakiros`.

**Why:** Batch C closes the loop — sentiment traces are now produced automatically at ingest time and queryable via IPC.
**How to apply:** Phase 5 (Batch D) wires the sismograph frontend track using `getSentimentTrace`.
