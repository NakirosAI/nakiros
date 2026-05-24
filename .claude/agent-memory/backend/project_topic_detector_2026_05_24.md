---
name: project_topic_detector_2026_05_24
description: TopicDetector wired 2026-05-24 (drift stage 3) — lexical Jaccard on user messages, /clear-aware, reuses cluster-tokens primitives
metadata:
  type: project
---

TopicDetector shipped 2026-05-24 as drift detection stage 3.

**Why:** Detects when a session has progressively drifted away from its original objective, without a /clear. Embeddings approach was rejected earlier (FR dev text gave systemic false positives). Pure lexical Jaccard chosen instead.

**How to apply:** When building new drift detectors: reuse `tokenizeForCluster`+`jaccard` from `runner-core/cluster-tokens.ts` (not from `conversation-analyzer.ts` — its local `tokenize()` is a private, slightly different variant). Use `loadUserMessages()` from `session-loader.ts` for the text. Add the detector in `drift-analyzer.ts` after existing stages.

## Key decisions

- Thresholds: `TRANSITION_THRESHOLD=0.15`, `FIRST_LAST_THRESHOLD=0.10`, `MIN_USER_MESSAGES=6`, `MIN_TRANSITIONS=2`.
- Severity high when `transitions >= 3` OR `firstLastSimilarity < 0.05`.
- `/clear` handling: only messages after the last `/clear` are considered. Detection on completely disjoint vocabularies produces `firstLastSimilarity=0` → always high severity.
- `loadUserMessages` skips tool_result-only user entries (Claude Code injects these as `type:user` messages — they are not real user intent).

## Files changed

- `services/drift/session-loader.ts` — added `UserMessage` interface, `loadUserMessages()`, refactored scan logic into `readSessionRaw()` shared by both loaders.
- `services/drift/topic-detector.ts` — new file, pure sync, no I/O.
- `services/drift-analyzer.ts` — stage 3 inserted after loop check.
- `services/drift/test-topic-detector.mjs` — 16/16 pass synthetic + real session.

## Real session result

Session `986df4e4` (79 user messages, one long design+backend session): 76 transitions, firstLast=4% → high topic drift detected. Expected — this was a sprawling multi-topic session.
