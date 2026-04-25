# index.ts

**Path:** `apps/nakiros/src/index.ts`

Public entry point for the `@nakirosai/nakiros` npm package. Re-exports exactly what downstream users (the CLI wrapper, consumers embedding the daemon in their own process) need to boot a Nakiros daemon: the Fastify factory, its options type, and the port helpers.

## Re-exports

- `createDaemonServer`, `DaemonServerOptions` — see [daemon/server.md](./daemon/server.md)
- `findFreePort`, `DEFAULT_PORT` — see [daemon/port.md](./daemon/port.md)
