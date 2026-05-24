---
name: project_loop_detector_2026_05_24
description: LoopDetector wired 2026-05-24 — drift étape 2. Session loader + loop signal detector under services/drift/.
metadata:
  type: project
---

LoopDetector shipped 2026-05-24 as drift detection stage 2.

**Files created:**
- `apps/nakiros/src/services/drift/session-loader.ts` — scans all `~/.claude/projects/<dir>/` dirs for `<sessionId>.jsonl`. No cwd required. Exports `loadSessionTurns(sessionId)` → `AssistantTurn[] | null`. Two-pass parse: pass 1 indexes tool_result by tool_use_id from user messages; pass 2 builds assistant turns with `ToolUseEvent[]` (tool, input, hasError, resultContent).
- `apps/nakiros/src/services/drift/loop-detector.ts` — exports `detectLoop(allTurns)` → `DriftReport | null`. Window=12 last turns, min=8 turns required. 4 signals: Edit/Write/MultiEdit same file_path (≥4), Bash same normalised-cmd with is_error=true (≥3), Grep/Glob same pattern (≥5), Read same file_path (≥5). Severity: high when multiple signals OR any signal >50% above threshold.
- `apps/nakiros/src/services/drift/test-loop-detector.mjs` — pure JS smoke test (15/15 pass, no TS compilation needed).

**Files modified:**
- `apps/nakiros/src/services/drift-analyzer.ts` — imports + wires loop detector in `analyzeDrift`. `force` path unchanged. If `loadSessionTurns` → null, returns null (session not found). If `detectLoop` → not null, returns it. Else returns null (stages 3-4 placeholder comment).

**Key design notes:**
- Bash without error is NOT counted — spec says "same stderr" means is_error present.
- `normaliseCmd` collapses whitespace so `  npm  run  build ` == `npm run build`.
- Session scan is linear over `~/.claude/projects/` entries — no caching (hook fires at most once per Stop). Healthy sessions return null fast (all signal counts < threshold).
- tsc --noEmit passes. `curl localhost:4242/api/drift?session=<id>` returns `{"drift":null}` on healthy session, `force=loop` still returns stub.

**Why:** [[project_apply_reco_noninteractive_2026_05_13]]
**How to apply:** When adding TopicDetector (stage 3) — add `detectTopic(turns)` call after `detectLoop` in `drift-analyzer.ts`. Same `AssistantTurn[]` input, same `DriftReport | null` output.
