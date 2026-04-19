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

export function savePreferences(prefs: AppPreferences): void {
  const next: AppPreferences = {
    theme: 'dark',
    language: prefs.language ?? 'system',
    updatedAt: prefs.updatedAt || new Date().toISOString(),
    mcpServerUrl: prefs.mcpServerUrl || undefined,
  };
  writeFileSync(storagePath(), JSON.stringify(next, null, 2), 'utf-8');
}

export function getSystemLanguage(): 'fr' | 'en' {
  const locale = process.env.LANG ?? process.env.LC_ALL ?? 'en';
  return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
