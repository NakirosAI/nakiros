---
name: project_recommendations_clustering_2026_05_13
description: recommendation-cluster.ts shipped 2026-05-13. ConversationFrictionPoint field name gotcha.
metadata:
  type: project
---

`recommendation-cluster.ts` shipped 2026-05-13 (commit abf3046, branch `feat/recommendations`). Pure-functional clustering module — no LLM, no I/O.

Key correction applied during implementation: `ConversationFrictionPoint.snippet` (NOT `.text`) holds the reaction message text. The task spec referred to `.text` but the actual shared type (project.ts line ~106) uses `snippet`. Always verify field names against the source type before copy-pasting from specs.

**Why:** Specs can lag behind type evolution; the `ConversationFrictionPoint` interface never had a `text` field.

**How to apply:** When a spec snippet uses a field name on a shared type, grep `packages/shared/src/types/` to confirm before writing code.

Also confirmed: `pnpm -F @nakiros/shared build` is mandatory before `tsc --noEmit` on nakiros when new types were added to shared (stale `dist/index.d.ts` silently shadows new exports). See [[feedback_shared_dist_stale]].
