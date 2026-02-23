export type ThemePreference = 'system' | 'light' | 'dark';
export type LanguagePreference = 'system' | 'fr' | 'en';
export type ResolvedTheme = 'light' | 'dark';
export type ResolvedLanguage = 'fr' | 'en';

export interface AppPreferences {
  theme: ThemePreference;
  language: LanguagePreference;
  updatedAt: string;
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  theme: 'system',
  language: 'system',
  updatedAt: '',
};
