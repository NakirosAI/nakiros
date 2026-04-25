# App.tsx

**Path:** `apps/landing/src/App.tsx`

Root component of the Nakiros marketing landing page. Composes the marketing sections in vertical order (Navbar, Hero, Etymology, Features, HowItWorks, OpenSource, FinalCta, Footer) on a `bg-[#080808]` background. Mounted by `main.tsx` inside the `I18nProvider` and intentionally separate from the in-app web UI in `apps/frontend` — only static marketing content lives here.

## Exports

### `App` (default export)

```ts
export default function App(): JSX.Element
```

Top-level layout for the landing site. Renders all sections in order; no props.
