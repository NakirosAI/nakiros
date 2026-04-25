# utils.ts

**Path:** `apps/landing/src/lib/utils.ts`

Misc helpers for the landing page. Currently exposes the `cn` className combinator used across components.

## Exports

### `cn`

```ts
export function cn(...inputs: ClassValue[]): string
```

Tailwind-aware className combinator. Runs `clsx` to flatten conditional class inputs, then `tailwind-merge` so conflicting utility classes resolve to the last one (e.g. `px-2 px-4` → `px-4`). Used by `InstallCommand`, `Button`, `LanguageSwitcher`, and any other landing component composing classes.
