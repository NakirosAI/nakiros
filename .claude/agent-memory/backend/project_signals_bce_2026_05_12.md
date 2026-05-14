---
name: project_signals_bce_2026_05_12
description: Signals B (backtrack), C (repetition), E (long-gap topic change) shipped 2026-05-12 into conversation-analyzer.ts
metadata:
  type: project
---

Signals B/C/E shipped 2026-05-12, commit abc164e on branch `feat/sentiment-prepass`.

**Why:** Extend friction detection beyond sentiment — structural patterns (backtrack, repetition) + workflow signal (topic change after gap).

**How to apply:** When adding new friction signals to `conversation-analyzer.ts`, follow this pattern:
1. Declare module-level interfaces (NOT inline in function — not visible to sibling functions).
2. Collect intermediate data during the first pass into Maps/arrays.
3. Write a pure top-level `detect*()` function taking those structures.
4. Call after the first pass, concat into `frictionPoints` / tips.
5. Bump CACHE_VERSION.

Key implementation details:
- `ToolUseRecord` + `UserMessageRecord` declared at module level.
- Signal B: `toolUsesByFile` Map populated in assistant branch. `priorStrings` accumulates BOTH `old_string` AND `new_string` per Edit turn so future edits can revert to intermediate states too.
- Signal C: Jaccard similarity via `tokenize()` (lowercase + split `/\W+/` + drop tokens < 3 chars) + `jaccard(Set, Set)` helpers. Window = 5 prior messages.
- Signal E: 30min gap threshold + Jaccard < 0.2 topic divergence. Aggregation: 1-2 pairs → individual tips; 3+ → single tip with `data.count`.
- `buildTips()` extended with `extraTips: ConversationTip[]` param — appended before sort+cap.
- Cache bumped v6 → v7.

Smoke test results on synthetic JSONL:
- B: 1 backtrack (`backtrack:auth.ts:T2->T4`), snippet = reverted function body
- C: 2 repetitions (`repetition:T1:0.56` and `repetition:T1:0.75`)
- E: 1 gap tip (gapMin: 35, turn: 4, severity: 'info')
