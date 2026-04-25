# Checkbox.tsx

**Path:** `apps/frontend/src/components/ui/Checkbox.tsx`

Themed checkbox built on the Radix `Checkbox` primitive. Used in forms across the Nakiros frontend; supports invalid styling and a focus ring.

## Exports

### `Checkbox`

```ts
function Checkbox(props: React.ComponentProps<typeof CheckboxPrimitive.Root>): JSX.Element
```

Wraps Radix `Checkbox.Root` + `Checkbox.Indicator`, rendering a `lucide-react` check icon when checked. Visual states (checked / disabled / aria-invalid / focus-visible) are driven entirely by Tailwind data-attribute selectors.
