---
name: project_recommendation_analyze_runner_2026_05_13
description: recommendation-analyze runner shipped 2026-05-13 — key gotchas around RunnerSpec sync constraint, BaseRun missing fields, sessionId placeholder, and rehydrate policy
metadata:
  type: project
---

`recommendation-analyze-runner.ts` shipped 2026-05-13 (commit c7968aa). Single-turn sonnet runner.

**Why:** Task 10 of the friction-pattern recommendations feature. Spawns a Claude Code subprocess that reads `pattern.json` + `inventory.json` from the workdir and writes markdown recommendation cards to `./recos/`.

**Key gotchas:**

1. `RunnerSpec.buildFirstPrompt` is **sync** — cannot `await` inside it. Moved inventory build to `prepareWorkdir`. Added `buildProjectInventorySync` to `recommendation-inventory.ts` (the async fn had no real awaits, safe to extract as sync; async alias delegates to sync).

2. `RecommendationAnalyzeRun` was missing `turns`, `tokensUsed`, `durationMs` required by `BaseRun` constraint — added those fields to the shared type (`packages/shared/src/types/recommendation.ts`).

3. `sessionId` field type is `string` (not nullable), initialized with `patternId` as stable placeholder. Runner-core overwrites it on first stream event. Use `sourcePatternId` for identity.

4. `rehydrate` policy: terminal runs → `{ kind: 'cleanup' }`; active-at-boot → mark `failed` + call `updatePatternAnalysis(..., { status: 'failed' })` so the UI shows a retry affordance.

5. `peekCachedAnalysis(providerProjectDir, convoId)` — `convoId` IS the `sessionId` field of the conversation. Signature confirmed.

6. `onTurnComplete` emits `{ type: 'done', recoCount }` (matches the union in `RecommendationAnalyzeRunEvent`). Runner-core's failure events go through `as unknown as TEvent` cast — no type collision.

**How to apply:** When wiring the handler (Task 11), resolve `projectPath` and `providerProjectDir` from the project registry before calling `startRecommendationAnalyze`. The public API mirrors `classify-convo-runner.ts`.
