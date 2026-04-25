# I18nProvider.tsx

**Path:** `apps/landing/src/i18n/I18nProvider.tsx`

i18n primitives for the landing page. Defines the `Locale` and `Messages` types, the `I18nProvider` that detects/persists the active locale, and the `useI18n` hook every section uses to pull its copy. EN/FR JSON bundles live next to this file in `./locales/`.

## Exports

### `Locale`

```ts
export type Locale = 'en' | 'fr'
```

Locales supported by the landing page.

### `Messages`

```ts
export type Messages = typeof en
```

Shape of the translation bundle, inferred from the English JSON file so adding a new key triggers a type error in the French file until it is translated.

### `I18nProvider`

```ts
export function I18nProvider(props: { children: ReactNode }): JSX.Element
```

Root i18n provider. Detects the initial locale from `localStorage` (`nakiros-landing-locale`) with a fallback to `navigator.language` ("fr*" → fr, otherwise en). Persists the locale to `localStorage` and reflects it on `document.documentElement.lang` whenever it changes. Mounted in `main.tsx`.

### `useI18n`

```ts
export function useI18n(): I18nContextValue
```

Hook returning `{ locale, messages, setLocale, availableLocales }`. Throws if called outside an `I18nProvider`.
