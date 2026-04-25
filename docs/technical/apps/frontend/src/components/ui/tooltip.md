# tooltip.tsx

**Path:** `apps/frontend/src/components/ui/tooltip.tsx`

Themed tooltip stack built on the Radix `Tooltip` primitive. Used to surface short hints on icon buttons, badges, and complex controls.

## Exports

### `Tooltip`

```ts
function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>): JSX.Element
```

Root of a single tooltip. Holds a `TooltipTrigger` and a `TooltipContent`. Must be inside a `TooltipProvider`.

### `TooltipTrigger`

```ts
function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>): JSX.Element
```

Element that opens the tooltip on hover/focus. Use Radix's `asChild` to graft the tooltip onto an existing button or link.

### `TooltipContent`

```ts
function TooltipContent(props: React.ComponentProps<typeof TooltipPrimitive.Content>): JSX.Element
```

Themed popover content. Portalled to `document.body`, animated with `tailwindcss-animate` keyframes, and decorated with a small arrow. Defaults `sideOffset` to 4.

### `TooltipProvider`

```ts
function TooltipProvider(props: React.ComponentProps<typeof TooltipPrimitive.Provider>): JSX.Element
```

Top-level provider for tooltips. Mount once near the app root to share a single delay-timer across every `Tooltip`. Defaults `delayDuration` to 300ms instead of Radix's 700ms default.
