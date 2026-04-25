import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { AppPreferences } from '@nakiros/shared';
import { nakirosFile } from '../utils/nakiros-dir.js';

const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'dark',
  language: 'system',
  updatedAt: '',
};

function storagePath(): string {
  return nakirosFile('preferences.json');
}

/**
 * Load persisted app preferences from `~/.nakiros/preferences.json`. Returns
 * defaults when the file is missing or unreadable. `theme` is pinned to
 * `'dark'` regardless of what's stored — light-mode isn't supported yet.
 */
export function getPreferences(): AppPreferences {
  const path = storagePath();
  if (!existsSync(path)) return DEFAULT_PREFERENCES;

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<AppPreferences>;
    return {
      theme: 'dark',
      language: parsed.language ?? 'system',
      updatedAt: parsed.updatedAt ?? '',
      mcpServerUrl: parsed.mcpServerUrl,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Persist app preferences to `~/.nakiros/preferences.json`. Auto-fills
 * `updatedAt` with `new Date().toISOString()` when the caller didn't set one.
 * Coerces `theme` to `'dark'` on write.
 */
export function savePreferences(prefs: AppPreferences): void {
  const next: AppPreferences = {
    theme: 'dark',
    language: prefs.language ?? 'system',
    updatedAt: prefs.updatedAt || new Date().toISOString(),
    mcpServerUrl: prefs.mcpServerUrl || undefined,
  };
  writeFileSync(storagePath(), JSON.stringify(next, null, 2), 'utf-8');
}

/**
 * Detect the UI language from the OS locale. Falls back to `'en'` when the
 * environment is missing or doesn't start with `fr`. Used when the user's
 * `language` preference is `'system'`.
 */
export function getSystemLanguage(): 'fr' | 'en' {
  const locale = process.env.LANG ?? process.env.LC_ALL ?? 'en';
  return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
