# language.ts

**Path:** `apps/frontend/src/utils/language.ts`

Resolves the user's language preference into a concrete language code.

## Exports

### `resolveLanguage`

```ts
function resolveLanguage(
  preference: LanguagePreference,
  systemLanguage?: string,
): ResolvedLanguage;
```

Returns `'fr'` or `'en'`. Explicit preferences pass through; `'system'`
falls back to `navigator.language` (or the supplied override): anything
starting with `fr` becomes `'fr'`, otherwise `'en'`.
