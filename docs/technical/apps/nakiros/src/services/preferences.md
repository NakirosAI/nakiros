# preferences.ts

**Path:** `apps/nakiros/src/services/preferences.ts`

Read/write the persisted `AppPreferences` blob stored at `~/.nakiros/preferences.json`, plus the OS-locale detector used when `language: 'system'`.

## Exports

### `function getPreferences`

Load persisted app preferences. Returns defaults when the file is missing or unreadable. `theme` is pinned to `'dark'` regardless of what's stored.

```ts
export function getPreferences(): AppPreferences
```

### `function savePreferences`

Persist app preferences. Auto-fills `updatedAt` when the caller didn't set one. Coerces `theme` to `'dark'` on write.

```ts
export function savePreferences(prefs: AppPreferences): void
```

### `function getSystemLanguage`

Detect UI language from the OS locale. Falls back to `'en'` when the environment is missing or doesn't start with `fr`.

```ts
export function getSystemLanguage(): 'fr' | 'en'
```
