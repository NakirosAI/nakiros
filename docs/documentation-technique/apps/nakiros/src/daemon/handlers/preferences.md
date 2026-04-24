# preferences.ts

**Path:** `apps/nakiros/src/daemon/handlers/preferences.ts`

Registers the `preferences:*` IPC channels — read/write the persisted `AppPreferences` stored under `~/.nakiros/`.

## IPC channels

- `preferences:get` — returns persisted `AppPreferences`
- `preferences:getSystemLanguage` — returns the detected OS locale (used to resolve `language: 'system'`)
- `preferences:save` — overwrites the stored preferences file

## Exports

### `const preferencesHandlers`

```ts
export const preferencesHandlers: HandlerRegistry
```
