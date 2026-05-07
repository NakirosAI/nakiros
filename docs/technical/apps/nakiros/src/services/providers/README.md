# providers/

**Path:** `apps/nakiros/src/services/providers/`

Per-agent provider scanners. Each scanner walks the provider's own project directory convention and returns `DetectedProject` records in the shared shape. Consumed by `project-scanner.ts` which merges results across providers into the unified registry.

## Files

- [claude-scanner.ts](./claude-scanner.md) — Scanner for Claude Code (`~/.claude/projects/<encoded-cwd>/`).
- [cowork-scanner.ts](./cowork-scanner.md) — Scanner for Cowork (Anthropic local-agent-mode) sessions keyed by space id.

Other providers (Cursor, Codex, Gemini) are not implemented yet — `ProviderType` reserves the identifiers but no scanner ships today.
