# Navbar.tsx

**Path:** `apps/landing/src/components/Navbar.tsx`

Sticky top navigation bar of the landing page. Renders the `NakirosLogo`, in-page anchor links (Etymology, Features, How it works), the `LanguageSwitcher`, a GitHub icon link, and the primary "Install" CTA pointing to `#install`. Anchor labels come from the `navbar` block of the active locale via `useI18n`.

## Exports

### `Navbar`

```ts
export function Navbar(): JSX.Element
```

React component for the top bar. Renders `messages.navbar.etymology`, `messages.navbar.features`, `messages.navbar.howItWorks`, and `messages.navbar.install`.
