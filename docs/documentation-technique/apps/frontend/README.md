# frontend/

**Path:** `apps/frontend/`

`@nakiros/frontend` — the Nakiros web UI. Vite + React + TypeScript SPA bundled and served by the daemon at `http://localhost:<port>/`. Talks to the daemon through the `window.nakiros` IPC proxy over a localhost WebSocket. Local-first: no network calls beyond the daemon.

## Subfolders

- [src/](./src/README.md) — Application source (App, views, components, hooks, lib, utils, i18n).
