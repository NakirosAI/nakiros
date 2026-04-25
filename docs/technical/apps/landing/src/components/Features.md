# Features.tsx

**Path:** `apps/landing/src/components/Features.tsx`

"Features" section of the landing page (anchor `#features`). Renders a 2-column grid of feature cards, one per entry of `messages.features.items`, each paired with an icon from lucide-react in fixed order (`Compass`, `ClipboardCheck`, `FlaskConical`, `Wrench`). Extras beyond four items fall back to the `Compass` icon.

## Exports

### `Features`

```ts
export function Features(): JSX.Element
```

React component for the features grid. Reads `messages.features.title`, `messages.features.description`, and `messages.features.items` via `useI18n`.
