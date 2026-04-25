# src/

**Path:** `apps/frontend/src/`

Source of the Nakiros web UI (Vite + React + TypeScript). Talks to the daemon through the `window.nakiros` IPC proxy installed by [`lib/nakiros-client.ts`](./lib/nakiros-client.md). Local-first: no network calls beyond the daemon's localhost WebSocket.

## Subfolders

- [components/](./components/README.md) — React components consumed by the views layer (UI primitives + feature components).
- [constants/](./constants/README.md) — Centralised constants (layout widths, window event names, z-index scale).
- [hooks/](./hooks/README.md) — Custom React hooks and context providers, including daemon-IPC adapters.
- [i18n/](./i18n/README.md) — i18next bootstrap and namespace loading.
- [lib/](./lib/README.md) — Browser-side daemon client and Tailwind classname helper.
- [utils/](./utils/README.md) — Pure helpers (dates, file types, ids, language, strings).
- [views/](./views/README.md) — Top-level view components mounted by `App.tsx` or `DashboardRouter`.

## Files

- [App.tsx](./App.md) — Root component: boots the daemon, loads preferences, routes between top-level views.
- [main.tsx](./main.md) — Browser entry point: imports the IPC client polyfill, awaits i18n, mounts `App`.
