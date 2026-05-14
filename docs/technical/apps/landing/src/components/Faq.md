# Faq.tsx

**Path:** `apps/landing/src/components/Faq.tsx`

Renders the "FAQ" section (section 08/09, v2 landing layout) — a single-open accordion that addresses common objections. Items come from `messages.faq.items` (q/a pairs). Uses local `open` state (index of the open item, -1 = all closed).

## Exports

### `Faq`

```ts
export function Faq(): JSX.Element
```

"FAQ" section — single-open accordion that addresses common objections. Occupies section 08/09 of the v2 landing layout.

Items are driven by `messages.faq.items` (q/a pairs). Clicking a row toggles it open; clicking the already-open row collapses all. The plus icon rotates 45° when the item is open via inline transition. Uses local `open` state (index of the open item, -1 = all closed).
