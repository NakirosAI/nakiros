# Hero.tsx

**Path:** `apps/landing/src/components/Hero.tsx`

Hero section of the landing page (anchor `#top`). Top-of-page block introducing Nakiros: animated eyebrow badge, 3-line headline with an accent line in teal, lead paragraph, primary `InstallCommand`, and a secondary anchor to `#how-it-works`. Copy is sourced from the `hero` block of the active locale via `useI18n`.

## Exports

### `Hero`

```ts
export function Hero(): JSX.Element
```

React component for the hero block. Renders the eyebrow, three-part headline (`titleLine1` + accent `titleAccent` + `titleLine2`), description, install command (`@nakirosai/nakiros`), and a "how it works" link.
