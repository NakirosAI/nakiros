# Button.tsx

**Path:** `apps/landing/src/components/ui/Button.tsx`

Shared button primitive for the landing page. Wraps a native `<button>` with focus-visible ring styling, three Tailwind variants (`primary` / `secondary` / `ghost`), and `tailwind-merge`-aware className composition via `cn`. Forwards refs so it can be used by tooltips/anchors that need DOM access. Independent of `apps/frontend/src/components/ui/Button` — kept duplicated to keep the landing bundle minimal.

## Exports

### `Button`

```ts
export const Button: React.ForwardRefExoticComponent<Props & React.RefAttributes<HTMLButtonElement>>
```

Forward-ref button. Props extend `ButtonHTMLAttributes<HTMLButtonElement>` plus:

- `variant?: 'primary' | 'secondary' | 'ghost'` — visual style (defaults to `'primary'`).
- `asChild?: boolean` — reserved for a future Radix-style slot pattern; currently unused.
