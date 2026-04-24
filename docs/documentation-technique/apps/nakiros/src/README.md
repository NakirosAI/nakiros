# src/

**Path:** `apps/nakiros/src/`

Source root of the `@nakirosai/nakiros` app — the Node ESM daemon that exposes the IPC/WebSocket server and the services that back every run kind (eval / audit / fix / create / comparison).

## Subfolders

- [daemon/](./daemon/README.md) — The Fastify HTTP + WebSocket server and the IPC handlers. Charnière du projet.
- [services/](./services/README.md) — Service layer: run-kind runners, readers/parsers/analyzers, and the shared `runner-core/` primitives.
- [utils/](./utils/README.md) — Cross-cutting utilities (currently only the `~/.nakiros/` path helpers).

## Files

- [index.ts](./index.md) — Public npm entry point — re-exports `createDaemonServer`, `findFreePort`, `DEFAULT_PORT`.
