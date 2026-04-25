# NakirosLogo.tsx

**Path:** `apps/landing/src/components/NakirosLogo.tsx`

Inline SVG of the Nakiros constellation logo. Decorative (`aria-hidden`) — used in the `Navbar` and `Footer`. Stroke and fill colors are baked into the SVG; only `className` is configurable so callers can size it via Tailwind.

## Exports

### `NakirosLogo`

```ts
export function NakirosLogo(props: { className?: string }): JSX.Element
```

React component rendering the logo as inline SVG. `className` defaults to `'h-7 w-7'`.
