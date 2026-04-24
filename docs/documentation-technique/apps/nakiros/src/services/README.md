# services/

**Path:** `apps/nakiros/src/services/`

Service layer behind the Nakiros daemon. Each run kind (eval / audit / fix / create / comparison) lives here as a `*-runner.ts`, plus the supporting readers/parsers/analyzers that feed them. The shared runner primitives (sandboxing, claude CLI driver, event log) live in `runner-core/`.

## Subfolders

- [runner-core/](./runner-core/README.md) — Domain-agnostic runner primitives: claude-CLI driver, sandboxing (git worktree + tmp dir), isolated HOME, run-id, run-store, event log.

Other subfolders (`providers/`) and the direct-service files (runners, readers, parsers, analyzers) have not been documented yet — run `/code-documentation <path>` with a scope under them.
