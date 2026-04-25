# strings.ts

**Path:** `apps/frontend/src/utils/strings.ts`

String helpers shared across views.

## Exports

### `truncatePath`

```ts
function truncatePath(path: string, maxLen?: number): string;
```

Truncates long file paths by prefixing with `…` and keeping the last
`maxLen − 1` characters. Returns the path unchanged when it already fits.
Default `maxLen` is `40`.
