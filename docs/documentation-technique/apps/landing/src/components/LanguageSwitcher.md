# LanguageSwitcher.tsx

**Path:** `apps/landing/src/components/LanguageSwitcher.tsx`

Compact EN/FR locale toggle rendered in the `Navbar`. Reads `locale`, `setLocale`, and `availableLocales` from `useI18n` and highlights the active locale. The locale change is persisted to `localStorage` by `I18nProvider`.

## Exports

### `LanguageSwitcher`

```ts
export function LanguageSwitcher(): JSX.Element
```

React component rendering one button per available locale. No props.
