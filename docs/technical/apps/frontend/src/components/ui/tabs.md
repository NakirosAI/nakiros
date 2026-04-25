# tabs.tsx

**Path:** `apps/frontend/src/components/ui/tabs.tsx`

Themed tab system built on the Radix `Tabs` primitive. Used by feature views (skill detail, eval, models tab, etc.) to switch between sub-panels.

## Exports

### `Tabs`

```ts
function Tabs(props: React.ComponentProps<typeof TabsPrimitive.Root>): JSX.Element
```

Root container. Lays its children out in a vertical flex column.

### `TabsList`

```ts
function TabsList(props: React.ComponentProps<typeof TabsPrimitive.List>): JSX.Element
```

Horizontal tab bar holding `TabsTrigger` buttons, separated from the content by a bottom border.

### `TabsTrigger`

```ts
function TabsTrigger(props: React.ComponentProps<typeof TabsPrimitive.Trigger>): JSX.Element
```

Clickable tab header rendered inside `TabsList`. The active state applies the primary colour via Radix's `data-state="active"` attribute.

### `TabsContent`

```ts
function TabsContent(props: React.ComponentProps<typeof TabsPrimitive.Content>): JSX.Element
```

Panel rendered for the currently active tab. Matched to a `TabsTrigger` via Radix's shared `value` prop.
