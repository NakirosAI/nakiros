# Footer.tsx

**Path:** `apps/landing/src/components/Footer.tsx`

Page footer for the landing site. Displays the Nakiros logo, tagline, "built with" line, and copyright. Last component rendered by `App`; all text comes from the `footer` block of the active locale via `useI18n`.

## Exports

### `Footer`

```ts
export function Footer(): JSX.Element
```

React component for the footer. Renders `messages.footer.tagline`, `messages.footer.builtWith`, and `messages.footer.copyright`.
