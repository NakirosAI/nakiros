# format.ts

**Path:** `apps/frontend/src/utils/format.ts`

Number / duration formatters reused across the run views, the eval matrix, and the conversation panels. Centralised so that "tokens", "compute duration" and "long duration" each have one canonical rendering. The unit symbols (`tok`, `ms`, `s`, `m`, `h`) are not localised — same in every translation today.

## Exports

### `interface FormatTokensOptions`

```ts
export interface FormatTokensOptions {
  unit?: string; // suffix appended after the number (e.g. 'tok' → '1.2k tok')
}
```

### `function formatTokens`

Compact token count: `123` (or `123 tok` with `unit: 'tok'`) and `1.2k` past 1000.

```ts
export function formatTokens(n: number, options?: FormatTokensOptions): string
```

### `function formatTokensSigned`

Same as `formatTokens` but always prefixes `+` for positive values — used for diff/delta display.

```ts
export function formatTokensSigned(n: number, options?: FormatTokensOptions): string
```

### `function formatComputeDuration`

Compact "ms / s / m" duration meant for sub-minute precision (turn time, eval run time, audit duration): `420ms` / `12.3s` / `1m05s`.

```ts
export function formatComputeDuration(ms: number): string
```

### `function formatLongDuration`

Coarse "s / m / h" duration for long-running spans (conversation length): `30s` / `5m` / `2h30m`.

```ts
export function formatLongDuration(ms: number): string
```
