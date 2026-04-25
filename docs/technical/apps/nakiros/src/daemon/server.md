# server.ts

**Path:** `apps/nakiros/src/daemon/server.ts`

Fastify daemon bootstrap. Builds the HTTP + WebSocket server, wires the IPC dispatcher against the merged handler registry, and serves either the built frontend bundle or a placeholder page. Also exposes the one-shot runtime init (`bootstrapDaemonRuntime`) that syncs bundled skills and rehydrates in-flight runs at boot.

## Exports

### `interface DaemonServerOptions`

Options accepted by `createDaemonServer`.

```ts
export interface DaemonServerOptions {
  host?: string;
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  /** Directory containing the built frontend (index.html + assets/). */
  frontendDir?: string;
}
```

### `function bootstrapDaemonRuntime`

One-shot runtime initialization called at daemon boot:
- Syncs bundled skills from the ROM into `~/.nakiros/skills/` (and symlinks them under `~/.claude/skills/`) so runners can resolve them.
- Rehydrates in-flight fix/create runs from `~/.nakiros/tmp-skills/` or cleans up orphan temp workdirs.
- Sweeps stray `nakiros-eval-*` skills left by previous eval sessions.
- Reclaims `~/.claude/projects/*` entries whose workdir has been deleted (Nakiros-named orphans only).
- Drops orphan worktrees from `~/.nakiros/sandboxes/` (crashed previous runs).

Safe to call multiple times.

```ts
export function bootstrapDaemonRuntime(): void
```

### `function createDaemonServer`

Build the Fastify daemon instance. Registers three surfaces:
- `POST /ipc/:channel` — dispatches to the handler registry built from `handlers/index.ts`. Unknown channels return 404; handler exceptions return 500 with the error message.
- `GET /ws` — WebSocket that mirrors every `eventBus.broadcast(...)` to connected clients. Also answers `ping` with `pong`.
- `GET /*` — static frontend bundle (SPA fallback) or a placeholder page when no bundle is found.

Callers are responsible for `bootstrapDaemonRuntime()` and `app.listen(...)`.

```ts
export async function createDaemonServer(opts?: DaemonServerOptions): Promise<FastifyInstance>
```

**Returns:** a configured but not-yet-listening Fastify instance.
