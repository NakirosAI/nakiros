---
name: project_sentiment_batch_d_2026_05_12
description: Sentiment Batch D — frictionPoints derived from sentiment trace in conversation-analyzer.ts, replacing regex patterns. Cache v3→v4.
metadata:
  type: project
---

Commit `bcfd866` on `feat/sentiment-prepass` (2026-05-12).

**Changes:**
- `services/conversation-analyzer.ts`: removed 13-entry `FRICTION_PATTERNS` array. Replaced with `loadSentimentTrace(cwd, sessionId)` lookup at analysis start. `SENTIMENT_FRICTION_THRESHOLD = 0.85`. Added `userMsgCounter` (1-indexed, incremented for non-`<command-name>` user messages). `matchedPattern` field now `'sentiment:0.92'` format.
- `services/conversation-analysis-cache.ts`: `CACHE_VERSION` bumped from 3 to 4.

**userMsgCounter location:** line ~165 in conversation-analyzer.ts (alongside `messageCount`).

**Why:** The regex patterns were brittle (false positives on common words like "actually", "non"). The sentiment model (≈48% Negative on real sessions) is more robust at high confidence threshold.

**How to apply:** Sessions without a trace → empty `frictionPoints` (graceful). The IIFE in ingest populates the trace asynchronously; next analyze pass picks it up.

**DONE_WITH_CONCERNS:** Index divergence between analyzer and ingest runner.
- Ingest runner (`runner.ts` line 293): builds `userInputs` from `getConversationMessages()` output, which filters BOTH `<command-name>` AND `<local-command->` (parser line 191).
- Analyzer: increments `userMsgCounter` only when `!text.includes('<command-name>')`, does NOT exclude `<local-command->`.
- Result: `<local-command->` messages increment `userMsgCounter` in the analyzer but were not present in the scorer's input. Index drifts by the count of `<local-command->` messages in the session. Fix would be to also exclude `<local-command->` from the analyzer counter — left as a separate concern.

**Why:** Fixing the divergence requires understanding if `<local-command->` messages appear often enough to matter. Low-priority since sentiment scores on those messages are absent from the trace (they're skipped), so `negativeUserIndices.get(idx)` returns `undefined` → no false friction. The risk is only missed friction on real user messages AFTER a `<local-command->` in the session.
