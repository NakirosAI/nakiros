# run-store.ts

**Path:** `apps/nakiros/src/services/runner-core/run-store.ts`

Authoritative on-disk snapshot of a run's state blob — read by the daemon at boot to rehydrate in-flight runs interrupted by a restart. Each runner writes its own shape; domain-specific recovery metadata can be stashed under private keys (e.g. `_mode`, `_realSkillDir` for fix).

## Exports

### `function persistRunJson`

Persist a run's state blob to `{workdir}/run.json`. Best-effort write — a failing disk write does not throw.

```ts
export function persistRunJson<T extends object>(workdir: string, blob: T): void
```

### `function loadRunJson`

Read the run state blob persisted by `persistRunJson`. Returns `null` when the file is missing or unreadable — callers treat both cases as "no recoverable run".

```ts
export function loadRunJson<T>(workdir: string): T | null
```
