# apps/

**Path:** `apps/`

Standalone apps in the Nakiros monorepo: the published npm daemon (`nakiros`), the web UI (`frontend`), and the marketing site (`landing`).

## Subfolders

- [frontend/](./frontend/README.md) — `@nakiros/frontend` — the Vite + React web UI bundled and served by the daemon over a localhost WebSocket.
- [landing/](./landing/README.md) — `@nakiros/landing` — the marketing landing page (static Vite + React, deployed standalone).
- [nakiros/](./nakiros/README.md) — `@nakirosai/nakiros` — the Node ESM daemon serving IPC, WebSocket, and the bundled frontend.
