# dates.ts

**Path:** `apps/frontend/src/utils/dates.ts`

Date helpers used by the context / settings views: freshness colour, age
in days, i18n-aware short relative time formatting.

## Exports

### `getDaysAgo`

```ts
function getDaysAgo(lastModifiedAt?: number): number | null;
```

Days elapsed since `lastModifiedAt` (timestamp ms). Returns `null` if the
date is missing.

### `freshnessColor`

```ts
function freshnessColor(days: number): string;
```

Maps a document age in days to a CSS colour: `< 3` → muted, `< 7` →
amber, otherwise red.

### `freshnessLabel`

```ts
function freshnessLabel(days: number, isGenerated: boolean, t: TFunc): string;
```

Translates a freshness label using the `context` namespace. Picks
`freshnessGenerated` or `freshnessModified`, both pluralised via
`{ count }`.

### `formatLastCheck`

```ts
function formatLastCheck(iso: string, t: TFunc): string;
```

Short relative time using `settings` keys: `timeAgoNow`, `timeAgoMinutes`,
`timeAgoHours`, `timeAgoDays`. Picks the largest meaningful unit.
