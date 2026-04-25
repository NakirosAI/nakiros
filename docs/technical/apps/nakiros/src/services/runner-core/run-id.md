# run-id.ts

**Path:** `apps/nakiros/src/services/runner-core/run-id.ts`

Tiny in-process id generator shared by every runner so run ids stay collision-free across eval / audit / fix / create / comparison inside a single daemon process.

## Exports

### `function generateRunId`

Generate a monotonically-increasing, human-readable run id of the form `{prefix}_{timestamp36}_{counter36}`.

```ts
export function generateRunId(prefix: string): string
```

**Parameters:**
- `prefix` — short domain tag prepended to the id (e.g. `eval`, `audit`, `fix`)
