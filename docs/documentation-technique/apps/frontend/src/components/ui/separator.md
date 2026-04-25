# separator.tsx

**Path:** `apps/frontend/src/components/ui/separator.tsx`

Thin divider built on the Radix `Separator` primitive. Used to delimit sections inside cards, headers and toolbars.

## Exports

### `Separator`

```ts
function Separator(props: React.ComponentProps<typeof SeparatorPrimitive.Root>): JSX.Element
```

Defaults to a horizontal, purely decorative line coloured with the theme's `--line` token. Pass `orientation="vertical"` for vertical dividers inside flex rows; pass `decorative={false}` when the divider has semantic meaning for assistive technologies.
