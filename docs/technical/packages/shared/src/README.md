# src/

**Path:** `packages/shared/src/`

Source root of `@nakiros/shared`. Everything exported from the package's barrel lives here: runtime constants, the canonical IPC channel registry, and the shared types that define every IPC contract.

## Subfolders

- [constants/](./constants/README.md) — Runtime constants shared between the daemon and the frontend (Claude model aliases, etc.).
- [types/](./types/README.md) — Shared TypeScript types consumed across daemon, frontend, and landing.

## Files

- [index.ts](./index.md) — Barrel entry point; the only module daemon + frontend import from.
- [ipc-channels.ts](./ipc-channels.md) — Canonical IPC channel registry. MUST be the single source of truth for channel names (enforced by `CLAUDE.md`).
