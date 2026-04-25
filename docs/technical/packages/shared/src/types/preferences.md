# preferences.ts

**Path:** `packages/shared/src/types/preferences.ts`

App-level preference types (theme, language, agent provider) plus the default MCP daemon URL. Persisted under `~/.nakiros/` and read on UI startup.

## Exports

### `type ThemePreference`

User preference for the UI theme. `system` defers to the OS setting.

```ts
export type ThemePreference = 'system' | 'light' | 'dark';
```

### `type LanguagePreference`

User preference for the UI language. `system` defers to the OS locale.

```ts
export type LanguagePreference = 'system' | 'fr' | 'en';
```

### `type ResolvedTheme`

Effective theme after resolving the `system` preference.

```ts
export type ResolvedTheme = 'light' | 'dark';
```

### `type ResolvedLanguage`

Effective language after resolving the `system` preference.

```ts
export type ResolvedLanguage = 'fr' | 'en';
```

### `type AgentProvider`

Supported agent providers across installers, runners, and scanners.

```ts
export type AgentProvider = 'claude' | 'codex' | 'cursor';
```

### `const DEFAULT_MCP_SERVER_URL`

Default URL the local Nakiros daemon listens on when running on localhost.

```ts
export const DEFAULT_MCP_SERVER_URL = 'http://localhost:3737';
```

### `interface AppPreferences`

Persisted app-level preferences stored under `~/.nakiros/`.

```ts
export interface AppPreferences {
  theme: ThemePreference;
  language: LanguagePreference;
  updatedAt: string;
  mcpServerUrl?: string;
}
```

### `const DEFAULT_APP_PREFERENCES`

Factory defaults applied when no preferences file exists yet.

```ts
export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  theme: 'dark',
  language: 'system',
  updatedAt: '',
};
```
