---
name: DotClaudeSnapshot v1 — 2026-05-04
description: DotClaudeSnapshot type + builder shipped. Wired in audit/fix runners for claudemd targets.
type: project
---

`DotClaudeSnapshot` v1 shipped 2026-05-04 on `feat/conversation-ingest`.

**What was built:**
- `packages/shared/src/types/dot-claude-snapshot.ts` — 9 interface types, all arrays non-optional
- `apps/nakiros/src/services/dot-claude-snapshot-builder.ts` — synchronous builder (`buildDotClaudeSnapshot`)
- Wired in `audit-runner.ts` and `fix-runner.ts` `prepareWorkdir` (claudemdTarget only)
- `SKILL.md` of `nakiros-claudemd-expert` updated with "Cross-entity context" section

**Why:** Option C from cadrage 2026-05-03 — 7 specialized `.claude/` experts each receive the full ecosystem snapshot for cross-entity coherence detection.

**How to apply:** When adding a new `.claude/` expert runner, wire `buildDotClaudeSnapshot` in its `prepareWorkdir` the same way. First consumer is claudemd-expert.

**Gotchas:**
- `parseFrontmatter`/`parseSimpleYaml` are private to both `claude-config-reader.ts` and `dot-claude-snapshot-builder.ts` — no shared export exists. Acceptable duplication.
- `let parsed: T = null; parsed = JSON.parse(raw) as typeof parsed` fails TS inference — use a named type alias: `type McpJson = {...}; let parsed: McpJson | null`.
- `RunnerSpec.prepareWorkdir` is synchronous — use `writeFileSync`, not async writes.
