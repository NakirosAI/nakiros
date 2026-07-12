# 03 — The Module Contract

A module is the unit of the suite. The contract that makes a module pluggable —
discoverable by the host, mountable by the shell, independent of its siblings —
is the **`ModuleManifest`**, declared in `@nakirosai/shared`.

> A module = **backend handlers + front screens + bundled skills + manifest**,
> all built against the shared kernel (`host`, `runner`, `shared`, `ui`).

## `ModuleManifest`

```ts
// packages/shared/src/types/module-manifest.ts  (NEW)
export interface ModuleManifest {
  /** Stable module id; also the IPC/route namespace root. */
  id: 'techne' | 'hestia' | 'argos' | 'pinax' | (string & {});
  name: string;
  version: string;

  /** Backend loaded in-process by the host. */
  backend: {
    /** Path to a module exporting `register(host): void` that mounts handlers. */
    register: string;
    /** Prefix for every IPC channel this module owns, e.g. "techne:". */
    ipcNamespace: string;
  };

  /** Front mounted by the shared shell under /{id}. */
  front: {
    /** Entry of the module's front bundle (its root component). */
    entry: string;
    /** Nav entries injected into the shell. */
    routes: { path: string; labelKey: string; icon?: string }[];
    /** i18n namespace for this module (avoids key collisions). */
    i18nNamespace: string;
  };

  /** Bundled skills run through the shared runner. */
  skills?: { dir: string }[];

  /** Inter-module capability declarations — see 05-inter-module-contracts.md. */
  provides?: string[];   // e.g. Argos: ["recommendation.producer"]
  consumes?: string[];   // e.g. Hestia: ["recommendation.consumer:claudemd", ...]
}
```

The manifest is the single thing the host reads to wire a module. Adding a
capability to a module is editing its manifest + its own code — never the host
and never another module.

## Module lifecycle

1. **Discovered** — the host finds the package and reads its manifest.
2. **Registered** — `register(host)` mounts handlers under `ipcNamespace`.
3. **Skilled** — bundled skills are synced and registered with the runner.
4. **Mounted** — front bundle served under `/{id}`, routes advertised via
   `GET /modules`.
5. **Active** — handlers respond; the module enqueues runs on the shared pool.
6. **Absent** — if not installed, the shell hides its nav and any cross-module
   feature degrades gracefully (see degradation rules in doc 05).

## IPC namespacing

Every channel a module owns is prefixed with its `ipcNamespace`. This keeps the
global `IPC_CHANNELS` registry collision-free across modules and lets the host
route `POST /ipc/:channel` to the owning module by prefix.

```
techne:skills.list      hestia:claudemd.audit     argos:drift.scan
```

## Evolution of the "IPC contract = 4 files" rule

Today `.claude/rules/ipc-contract.md` requires any channel change to update four
files in lockstep:

1. `packages/shared/src/ipc-channels.ts`
2. `apps/nakiros/src/daemon/handlers/index.ts` (+ the handler)
3. `apps/frontend/src/lib/nakiros-client.ts`
4. `apps/frontend/src/global.d.ts`

Under the modular model this becomes **per-module**, but the discipline is
identical:

1. The module declares its channels in **its own** channel constants, exported
   through `@nakirosai/shared` under its namespace.
2. The module registers the handler in **its own** `register(host)`.
3. The shared client (`@nakirosai/ui` transport) exposes typed methods derived
   from the module's channel map.
4. The module's front types declare the matching calls.

The single source of truth (`IPC_CHANNELS`) stays — split into namespaced
sub-maps, one per module, re-exported from `@nakirosai/shared`. No hardcoded
channel strings, ever. Type-check per workspace remains the contract
enforcement.

## What goes in `@nakirosai/shared`

Only **cross-boundary** types: the manifest, IPC channel maps, payload types,
and inter-module contracts (the recommendation card). Module-internal types stay
inside the module. This keeps `shared` small and stable — it is the one package
every module and the host depend on.
