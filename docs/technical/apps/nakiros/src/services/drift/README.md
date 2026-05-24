# drift/

**Path:** `apps/nakiros/src/services/drift/`

Internal modules for the Nakiros drift detection pipeline. Each file implements one layer of the detection stack: session loading (raw JSONL → structured data), and per-detector logic. Consumed exclusively by `drift-analyzer.ts`; do not import directly from daemon handlers or runners.

## Files

- [session-loader.ts](./session-loader.md) — Locates a Claude Code session JSONL by session ID and extracts assistant turns (tool-use events), real user messages, and context window metrics, scanning all `~/.claude/projects/` directories.
- [loop-detector.ts](./loop-detector.md) — Detects loop drift by counting repeated tool actions (same file, same command, same pattern) across the last 12 assistant turns.
- [topic-detector.ts](./topic-detector.md) — Detects topic drift by measuring Jaccard similarity between consecutive user messages and between the first and last user message; exports `computeTopicMetrics` as a shared primitive for the context detector.
- [context-detector.ts](./context-detector.md) — Detects context pollution drift when the context window is ≥ 50% full and topic metrics indicate the conversation has shifted; only fires when the topic detector did not already trigger.
- [hook-script.ts](./hook-script.md) — Source strings for the two CJS hook scripts (`hook-stop.cjs` + `hook-userpromptsubmit.cjs`) installed under `~/.nakiros/drift/`; each calls `GET /api/drift?session=<id>` and emits a banner or `additionalContext`.
- [hook-paths.ts](./hook-paths.md) — Path resolver for drift CJS scripts and command strings written into `~/.claude/settings.json`.
- [hook-installer.ts](./hook-installer.md) — Idempotent installer / uninstaller for the Stop + UserPromptSubmit drift hooks; preserves all other hooks in `settings.json`.
