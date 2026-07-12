# run-status.ts

**Path:** `apps/nakiros/src/services/runner-core/run-status.ts`

Cross-run-kind predicate for resumable states — used when rehydrating runs after a daemon restart and when deciding whether a new request should rebind to an existing run or start fresh.

## Exports

### `function isActiveRunStatus`

True when a run is in a non-terminal, resumable state — i.e. worth rebinding a fresh client to instead of starting a brand new run. Excludes `queued` and `grading` (eval-only transient states) by design. `awaiting_approval` / `executing` (bootstrap-only) count as active: both are "resting, no live Claude subprocess" states just like `waiting_for_input` — the bootstrap run is still meaningfully in progress and worth rebinding a client to.

```ts
export function isActiveRunStatus(status: AuditRunStatus | EvalRunStatus | BootstrapRunStatus): boolean
```

**Returns:** `true` for `starting`, `running`, `waiting_for_input`, `awaiting_approval`, `executing`; `false` for every other status.
