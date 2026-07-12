# 06 — Package Topology

## Target package map

```
@nakirosai/shared      contracts: ModuleManifest, IPC channel maps, payloads,
                       inter-module types (RecoCard). Depended on by everything.
@nakirosai/runner      the agent runner pool (extracted from runner-core).
@nakirosai/ui          design system + shell primitives + LifecycleScreen scaffold.
@nakirosai/host        Fastify host, dispatcher, event-bus, WS, service-manager,
                       provider/read layer, module discovery + loading. Ships the
                       `nakiros` bin and the OS service. Serves the shell.

@nakirosai/techne      module: skill/plugin authoring (backend + front + skills + manifest)
@nakirosai/hestia      module: .claude/.codex/.cursor configuration
@nakirosai/argos       module: conversation analysis + drift + recommendations
@nakirosai/pinax       module: cross-repo knowledge base (net-new)
```

## Dependency graph

```
            ┌────────────────────────────────────────────┐
            │              @nakirosai/shared              │
            └───▲─────────▲──────────▲──────────▲─────────┘
                │         │          │          │
   ┌────────────┴──┐ ┌────┴─────┐ ┌──┴──────┐ ┌─┴──────────┐
   │ @nakirosai/   │ │ @nakir.. │ │ @nak..  │ │ each module │
   │   runner      │ │   ui     │ │  host   │ │  techne …   │
   └───────▲───────┘ └────▲─────┘ └────▲────┘ └──┬───┬───┬──┘
           │              │            │         │   │   │
           └──────────────┴────────────┴─────────┘   │   │
        modules depend on: shared, runner, ui, host  │   │
        modules NEVER depend on another module ───────────┘
```

Rules:

- Every module depends on `@nakirosai/{shared, runner, ui, host}` and nothing
  else from the suite.
- No module depends on another module — cross-module flow is via `shared`
  contracts + `provides`/`consumes` (doc 05).
- `host` depends on `shared`, `runner`, `ui`. It loads modules dynamically at
  runtime; it does **not** statically depend on any module.

## `install -g` behaviour

`@nakirosai/nakiros` stays the **primary install** — the command clients already
use does not change. It is the host (+ a default set of modules, see below).
Modules are added **on top**, as separate global installs, and discovered by the
running host.

```bash
npm install -g @nakirosai/nakiros          # the platform — unchanged command
```

- Is the host: provides the `nakiros` command + registers the OS service (once)
  + serves `:4242` + the module loader.
- Boot → host scans for installed `@nakirosai/*` modules and serves them.

```bash
npm install -g @nakirosai/techne           # add a module on top
```

- A sibling global package. The **already-running host** (from `nakiros`)
  discovers it on next boot — no second service, no second port, no second
  runner. `:4242` now serves Techne too.

### How a separately-installed module is discovered

The host scans for `@nakirosai/*` packages carrying a `ModuleManifest`:

- the global install root (`npm root -g`), and
- `~/.nakiros/modules/`.

It does **not** statically depend on any module — discovery is by manifest, so a
module that lands on disk after `nakiros` is installed is picked up at next boot.

### Modules use the host's kernel, not their own copy

A module **must not** ship and run its own `host`/`runner`/`ui`/`shared`. It
declares them as **`peerDependencies`** and is loaded into the **nakiros host
process**, using the host's singletons (one Fastify, one runner pool, one design
system). The manifest's `version` lets the host check kernel compatibility at
discovery and warn on mismatch. This is what makes "one process, one port, one
runner" hold even when modules are installed independently.

### `@nakirosai/nakiros` is a lean host — every module is opt-in

`nakiros` bundles **no module by default**. It is the platform: host, loader,
shell, `:4242`, and a **module catalog**. Nothing forces Hestia, Techne, or
Argos — a user can run Nakiros with none of them, or only the ones they want.

```bash
npm install -g @nakirosai/nakiros     # lean platform, no modules
npm install -g @nakirosai/argos       # add only Argos, nothing else
```

- **Everything is a module, nothing is special.** Hestia/Techne/Argos/Pinax and
  any third-party module are all added the same way and discovered the same way.
- First run shows the **module catalog** so users add what they want without
  touching the CLI.
- Migration note: this is a change for existing users (today's monolith ships
  everything). The catalog + a clear first-run flow cover the gap — see the
  migration plan.

## Monorepo layout (dev)

Development stays a single monorepo (turbo/pnpm); packages are published
independently.

```
apps/
  host/          # @nakirosai/host  (was apps/nakiros daemon + shell host)
  landing/       # marketing site (unchanged)
packages/
  shared/        # @nakirosai/shared
  runner/        # @nakirosai/runner  (extracted from runner-core)
  ui/            # @nakirosai/ui      (extracted from frontend components/ui + scaffolds)
modules/
  techne/        # @nakirosai/techne  (backend + front + skills + manifest)
  hestia/        # @nakirosai/hestia
  argos/         # @nakirosai/argos
  pinax/         # @nakirosai/pinax
```

The split of today's `apps/nakiros` + `apps/frontend` into these targets is the
subject of [`07-migration.md`](07-migration.md).

## Versioning

- `shared`, `runner`, `ui`, `host` are the kernel: versioned together, semver,
  breaking changes are loud (they ripple to every module).
- Modules version independently; each declares the kernel range it supports.
- The manifest carries a `version` so the host can warn on incompatible
  kernel/module pairs at discovery time.
