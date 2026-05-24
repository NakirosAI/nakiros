---
name: project_context_detector_2026_05_24
description: ContextDetector wired 2026-05-24 (drift étape 4) — context pollution detection with topic metric reuse and non-double-trigger ordering
metadata:
  type: project
---

ContextDetector wired 2026-05-24 (drift étape 4).

**New files:**
- `services/drift/context-detector.ts` — new detector
- `services/drift/test-context-detector.mjs` — 14/14 pass

**Modified files:**
- `services/drift/session-loader.ts` — added `ContextMetrics` interface + `parseContextMetrics()` (private) + `loadContextMetrics()` (public). Single-pass scan on assistant turns, extracts `maxContextTokens` + `contextWindow` (same logic as `conversation-analyzer.ts` but no import of that heavy module). Context window: >250k observed peak → 1M, else 200k.
- `services/drift/topic-detector.ts` — extracted `computeTopicMetrics(userMessages): TopicMetrics | null` as an exported shared function. `detectTopic()` now delegates to it. New exported `TopicMetrics` interface with `{ transitionsDetected, firstLastSimilarity, userMessageCount }`.
- `services/drift-analyzer.ts` — stage 4 wired: imports `detectContext` + `loadContextMetrics`. Context detector only called after topic detector returns null (non-double-trigger by ordering).

**Thresholds (context-detector.ts):**
- `CONTEXT_USAGE_THRESHOLD = 0.50` — minimum fill to fire
- `HIGH_USAGE_THRESHOLD = 0.75` — above this → high severity unconditionally
- `CONTEXT_FIRST_LAST_THRESHOLD = 0.20` — looser than topic's 0.10
- `MIN_USER_MESSAGES = 10` — longer threshold than topic (needs macro signal)

**Severity logic:**
- `high` if `contextUsageRatio >= 0.75` OR (`transitions >= 2` AND `firstLastSimilarity < 0.10`)
- `medium` otherwise

**Why:** `getOrComputeAnalysis` from `conversation-analysis-cache.ts` requires `providerProjectDir` which is unknown at Stop-hook time. Using `loadContextMetrics` (JSONL scan) avoids needing the cache infrastructure.

**How to apply:** For any future detector that needs context window pressure, import `loadContextMetrics` from `session-loader.ts`. For topic metrics reuse, import `computeTopicMetrics` from `topic-detector.ts`.

**KEY PITFALL:** Cohesive single-topic messages with varied wording still score `firstLastSimilarity < 0.20` in Jaccard (stop-word filtering leaves too few shared tokens). To guarantee null in tests, use messages with identical highly-repetitive vocabulary (same exact words).

Related: [[project_loop_detector_2026_05_24]], [[project_topic_detector_2026_05_24]]
