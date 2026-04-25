# utils.ts

**Path:** `apps/frontend/src/lib/utils.ts`

Tailwind-aware classname helper used everywhere in the frontend. Combines
`clsx` (conditional class composition) with `tailwind-merge` (last-write-
wins on conflicting Tailwind utilities).

## Exports

### `cn`

```ts
function cn(...inputs: ClassValue[]): string;
```

Returns a deduplicated, conflict-resolved Tailwind classname string.
