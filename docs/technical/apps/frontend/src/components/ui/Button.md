# Button.tsx

**Path:** `apps/frontend/src/components/ui/Button.tsx`

Primary call-to-action component for the Nakiros frontend. Uses Radix `Slot` for the `asChild` pattern and `class-variance-authority` to expose a typed `variant`/`size` API. The variant recipe is exported as `buttonVariants` so other components (links styled as buttons, etc.) can reuse the exact same Tailwind classes.

## Exports

### `Button`

```ts
function Button(props: ButtonProps): JSX.Element
```

Wraps a native `<button>` (or any child element via `asChild`) with the shared shadcn/ui-flavoured Tailwind recipe. When `loading` is true the button is implicitly disabled.

**Parameters:**
- `variant` — `'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'`.
- `size` — `'default' | 'sm' | 'lg' | 'icon'`.
- `asChild` — render the child element via Radix `Slot` instead of `<button>`.
- `loading` — implicitly disables the button.

### `buttonVariants`

```ts
const buttonVariants: (props?: VariantProps) => string
```

`class-variance-authority` recipe powering `Button`. Re-exported so consumers can apply the exact same classes to non-button elements.
