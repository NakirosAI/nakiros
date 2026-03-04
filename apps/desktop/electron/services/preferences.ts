import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { AppPreferences } from '@nakiros/shared';

const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'system',
  language: 'system',
  updatedAt: '',
  mcpServerUrl: undefined,
  agentProvider: 'claude',
};

function getStoragePath(): string {
  const dir = app.getPath('userData');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, 'preferences.json');
}

export function getPreferences(): AppPreferences {
  const path = getStoragePath();
  if (!existsSync(path)) return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<AppPreferences>;
    return {
      theme: parsed.theme ?? 'system',
      language: parsed.language ?? 'system',
      updatedAt: parsed.updatedAt ?? '',
      mcpServerUrl: parsed.mcpServerUrl,
      agentProvider: parsed.agentProvider ?? 'claude',
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: AppPreferences): void {
  const next: AppPreferences = {
    theme: prefs.theme ?? 'system',
    language: prefs.language ?? 'system',
    updatedAt: prefs.updatedAt || new Date().toISOString(),
    mcpServerUrl: prefs.mcpServerUrl || undefined,
    agentProvider: prefs.agentProvider ?? 'claude',
  };
  writeFileSync(getStoragePath(), JSON.stringify(next, null, 2), 'utf-8');
}
