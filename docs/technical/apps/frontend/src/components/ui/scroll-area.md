# scroll-area.tsx

**Path:** `apps/frontend/src/components/ui/scroll-area.tsx`

Themed scroll container built on the Radix `ScrollArea` primitive. Replaces the platform scrollbar with a custom thumb that picks up the Nakiros theme tokens.

## Exports

### `ScrollArea`

```ts
function ScrollArea(props: React.ComponentProps<typeof ScrollAreaPrimitive.Root>): JSX.Element
```

Wraps Radix `ScrollArea.Root` + `Viewport` and renders a vertical `ScrollBar` plus a corner. Pass `children` to populate the viewport.

### `ScrollBar`

```ts
function ScrollBar(props: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>): JSX.Element
```

Custom scrollbar used inside `ScrollArea`. Defaults to vertical orientation; pass `orientation="horizontal"` for horizontal lists.
