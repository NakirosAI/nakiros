# LoadingState.tsx

**Path:** `apps/frontend/src/components/ui/LoadingState.tsx`

Centered muted-text placeholder for "loading" / "no item selected" panels. Replaces the repeated inline `flex flex-1 items-center justify-center text-[var(--text-muted)]` pattern used across 15+ views. For full empty states (with title + action), use `EmptyState`.

## Exports

### `type LoadingStateSize`

Text-size variant for the message — matches the dominant inline-text scales used across the views.

```ts
export type LoadingStateSize = 'xs' | 'sm' | 'md'
```

### `function LoadingState`

Centered muted-text placeholder. Default size is `'md'` (parent's font size); pass `'xs'` / `'sm'` for dense panels. Use `className` to add padding (`px-4`), gap, or override the colour for error variants.

```ts
export function LoadingState(props: {
  children?: ReactNode;
  size?: LoadingStateSize;
  className?: string;
}): JSX.Element
```
