/** User preference for the UI theme. `system` defers to the OS setting. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** User preference for the UI language. `system` defers to the OS locale. */
export type LanguagePreference = 'system' | 'fr' | 'en';

/** Effective theme after resolving the `system` preference. */
export type ResolvedTheme = 'light' | 'dark';

/** Effective language after resolving the `system` preference. */
export type ResolvedLanguage = 'fr' | 'en';

/** @deprecated Import AgentProvider from `types/agent` (re-exported by the package root). */
export type { AgentProvider } from './agent.js';

/**
 * UI density preference for the new-design token system. Drives
 * `[data-density]` overrides of `--n-row-h` and `--n-pad-card`.
 */
export type DensityPreference = 'standard' | 'compact' | 'comfy';

/** Default UI density when no preference is stored yet. */
export const DEFAULT_DENSITY: DensityPreference = 'standard';

/** Default Nakiros teal accent hue, in OKLch hue degrees [0, 360). */
export const DEFAULT_ACCENT_HUE = 195;

/** Default URL the local Nakiros daemon listens on when running on localhost. */
export const DEFAULT_MCP_SERVER_URL = 'http://localhost:3737';

/** Persisted app-level preferences stored under `~/.nakiros/`. */
export interface AppPreferences {
  theme: ThemePreference;
  language: LanguagePreference;
  updatedAt: string;
  mcpServerUrl?: string;
  /** UI density. Defaults to `'standard'` when unset. */
  density?: DensityPreference;
  /** Accent hue in OKLch hue degrees [0, 360). Defaults to {@link DEFAULT_ACCENT_HUE}. */
  accentHue?: number;
}

/** Factory defaults applied when no preferences file exists yet. */
export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  theme: 'dark',
  language: 'system',
  updatedAt: '',
  density: DEFAULT_DENSITY,
  accentHue: DEFAULT_ACCENT_HUE,
};
