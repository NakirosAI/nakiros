---
name: project_sentiment_migration_bert_2026_05_12
description: Sentiment model migrated to bert-nlptown 5-class with topk:5 summed probabilities approach. Key gotcha about label vs friction behavior.
metadata:
  type: project
---

Migration shipped 2026-05-12 (commit 33aa0c3). Model: `Xenova/bert-base-multilingual-uncased-sentiment`.

**Why:** 87% accuracy vs 53% for distilbert. Fixes all 3 pain cases. Distilbert had near-empty Neutral bucket (5.2%) — bimodal Pos/Neg.

**Implementation choice: topk:5 summed probabilities** (not topk:1 direct):
- P(Negative) = P(1*) + P(2*)
- P(Neutral) = P(3*)
- P(Positive) = P(4*) + P(5*)

**KEY GOTCHA:** The topk:5 summed approach gives *different labels* than topk:1 on borderline messages:
- "ouai passons sur sonnet" → label=Negative, score=0.394 with topk:5 (vs Neutral 0.25 with topk:1 in A/B test)
- The *friction criterion* is `label=Negative && score > 0.60` — these messages don't trigger friction (score below threshold)
- The A/B test used topk:1 and checked label directly; the production implementation uses summed probabilities

**How to apply:** When debugging sentiment classification, always check the **friction criterion** (label + threshold), not just the label in isolation. A Negative label with low summed score is NOT a friction point.

Threshold: 0.60 (was 0.85 for distilbert). Cache: v6 (was v5). Files: `services/sentiment/pipeline.ts`, `services/sentiment/index.ts`, `services/conversation-analyzer.ts`, `services/conversation-analysis-cache.ts`.
