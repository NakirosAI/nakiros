# constants/

**Path:** `packages/shared/src/constants/`

Runtime constants shared between the daemon and the frontend — typically enum-like string literal tuples with derived types and labels.

## Files

- [claude-models.ts](./claude-models.md) — Canonical list of Claude model aliases (`opus` / `sonnet` / `haiku`), derived type, labels, and type guard.
- [editor-definitions.ts](./editor-definitions.md) — Source-of-truth metadata for every editor environment (`claude` / `cursor` / `codex`): label, home marker, commands subdirectory.
