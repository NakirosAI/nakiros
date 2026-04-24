/** User preference for the UI theme. `system` defers to the OS setting. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** User preference for the UI language. `system` defers to the OS locale. */
export type LanguagePreference = 'system' | 'fr' | 'en';

/** Effective theme after resolving the `system` preference. */
export type ResolvedTheme = 'light' | 'dark';

/** Effective language after resolving the `system` preference. */
export type ResolvedLanguage = 'fr' | 'en';

/** Supported agent providers across installers, runners, and scanners. */
export type AgentProvider = 'claude' | 'codex' | 'cursor';

/** Default URL the local Nakiros daemon listens on when running on localhost. */
export const DEFAULT_MCP_SERVER_URL = 'http://localhost:3737';

/** Persisted app-level preferences stored under `~/.nakiros/`. */
export interface AppPreferences {
  theme: ThemePreference;
  language: LanguagePreference;
  updatedAt: string;
  mcpServerUrl?: string;
}

/** Factory defaults applied when no preferences file exists yet. */
export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  theme: 'dark',
  language: 'system',
  updatedAt: '',
};
