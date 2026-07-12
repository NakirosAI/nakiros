# 02 — Runtime Architecture

## The constraint that shapes everything

Modules must be **independent** (own code, own backend handlers, own front, own
skills) but installing several of them must **not** produce N node processes or N
URLs. Two installed modules must both be usable on a single `localhost:4242`.

The resolution: **"each module has its own backend" means its own *code*, not its
own *process*.** One host runtime, one port, one runner pool — modules are loaded
into it as in-process plugins, discovered through manifests.

## This is an evolution of what already exists

`apps/nakiros` is already a Fastify server on `127.0.0.1:4242` with:

- `POST /ipc/:channel` — a generic IPC dispatcher backed by a handler registry.
- `GET /ws` — a WebSocket broadcasting event-bus frames.
- `GET /*` — static serving of the bundled React UI, SPA fallback.

The modular model does not rewrite this. It says:

- the dispatcher routes to handlers **registered by each module**, and
- the static server **mounts each module's front**, and
- a **manifest scan** at boot decides which modules exist.

## Topology

```
                         localhost:4242
                    ┌──────────────────────────┐
                    │  @nakirosai/host         │   1 node process
                    │  (Fastify + event-bus    │   1 port
                    │   + service-manager)     │   1 runner pool
                    └──────────┬───────────────┘
   boot: scan installed @nakirosai/* → read ModuleManifest[]
         → import(register) each backend  → mount each front under /{id}
         → register each module's bundled skills with the shared runner
        ┌─────────────┬───────────┴───────┬─────────────────┐
   /techne/*     /hestia/*            /argos/*          /  (shell)
   techne:* IPC  hestia:* IPC         argos:* IPC       reads /modules,
   handlers      handlers             handlers          renders nav + mounts
        └─────────────┴───────────┬───────┴─────────────────┘
                  ┌───────────────▼───────────────┐
                  │  @nakirosai/runner            │  ONE pool — modules
                  │  (singleton run service)      │  enqueue runs, never
                  └───────────────────────────────┘  spawn their own
```

## Boot sequence

1. The host binary starts (provided by `@nakirosai/host`, registered once as the
   OS service via the existing `service-manager`: launchd / systemd).
2. **Discover.** Scan installed `@nakirosai/*` packages (global node_modules and
   `~/.nakiros/modules/`), read each `ModuleManifest`. See
   [`03-module-contract.md`](03-module-contract.md).
3. **Mount backends.** For each manifest, `import(backend.register)` and call
   `register(host)`, which adds the module's handlers under its `ipcNamespace`
   (`techne:*`, `hestia:*`, …). Names stay globally unique by construction.
4. **Mount skills.** Register each module's bundled skills with the shared
   runner (synced to `~/.nakiros/skills/` as today).
5. **Serve fronts.** Expose each module's front bundle under `/{id}`; expose
   `GET /modules` so the shell knows what to render.
6. **Serve shell.** `GET /` serves the shared shell, which calls `/modules` and
   lights up only the installed modules.

## What is shared vs per-module

| Shared kernel | Per module |
|---------------|------------|
| Host (Fastify, dispatcher, event-bus, WS) | IPC handlers (namespaced) |
| Runner pool (`@nakirosai/runner`) | Backend services |
| Contracts (`@nakirosai/shared`) | Front screens (against shared `ui`) |
| Design system (`@nakirosai/ui`) | Bundled skills |
| Service manager (launchd/systemd) | Manifest |
| Provider/read layer (multi-AI scanners) | — |

## Why this keeps modules independent

Independence is enforced at the **dependency graph**, not the process boundary:

- A module depends only on `@nakirosai/{host, runner, shared, ui}`.
- A module **never** imports another module.
- Cross-module behaviour happens exclusively through `@nakirosai/shared`
  contracts (e.g. the recommendation bridge, see
  [`05-inter-module-contracts.md`](05-inter-module-contracts.md)) plus the
  `provides`/`consumes` capability declarations in the manifest.

So Argos can produce recommendations whether or not Hestia is installed; Hestia
applies them whether or not Argos is installed. They never reference each other's
code.

## The one trade-off

In-process plugins share a process, so a crashing module can take the host down.
Acceptable for v1: local-first, single-user, restartable service. If isolation
becomes necessary, modules move to **worker threads** behind the same host and
the same port — the `ModuleManifest` does not change. We do not build that now.

## Multi-AI

The seed already exists: `services/providers/` (`claude-scanner`,
`cowork-scanner`). Going beyond Claude means a provider abstraction over (a) the
agent runner and (b) the config formats (`.claude` vs `.codex` vs `.cursor`).
This lives in the shared kernel because Techne and Hestia both depend on it. It
is called out here because it influences every module; detailed design is out of
scope for this pass.
