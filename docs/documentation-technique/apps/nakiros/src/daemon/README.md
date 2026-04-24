# daemon/

**Path:** `apps/nakiros/src/daemon/`

The Nakiros daemon: a Fastify HTTP + WebSocket server that exposes `POST /ipc/:channel` (IPC dispatcher), `GET /ws` (broadcast mirror for UI events), and serves the built frontend bundle. This is the charnière of the project — every UI action flows through here and runners push events back through the shared event bus.

The daemon is a plain Node ESM bundle (tsup). Do not use `require()` — use static `import` from `'node:fs'` etc. Do not import from `electron`; it's gone.

## Subfolders

- [handlers/](./handlers/README.md) — Domain-scoped IPC handler bundles merged into the final registry.

## Files

- [event-bus.ts](./event-bus.md) — Shared in-process event bus. Runners broadcast via `eventBus.broadcast(channel, payload)`; the `/ws` WebSocket fans broadcasts out.
- [port.ts](./port.md) — Default TCP port + free-port probe.
- [server.ts](./server.md) — Fastify bootstrap: IPC dispatcher, WebSocket handler, static frontend, plus `bootstrapDaemonRuntime()` for one-shot init (bundled-skills sync, run rehydration, orphan sweeps).
