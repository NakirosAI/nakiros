# port.ts

**Path:** `apps/nakiros/src/daemon/port.ts`

Port helpers for the Nakiros daemon HTTP server. Provides the default port and a free-port probe so boot succeeds when the default is taken.

## Exports

### `const DEFAULT_PORT`

Default TCP port the Nakiros daemon listens on (`http://localhost:4242`).

```ts
export const DEFAULT_PORT = 4242;
```

### `function findFreePort`

Probe ports starting from `start` and return the first one not in use.

```ts
export async function findFreePort(start: number, maxTries = 20): Promise<number>
```

**Parameters:**
- `start` — first port to probe (inclusive)
- `maxTries` — how many consecutive ports to try before giving up

**Returns:** the first free port in `[start, start + maxTries)`.

**Throws:** `Error` — when every port in the range is in use.
