import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { AppPreferences } from '@nakiros/shared';
import { nakirosFile } from '../utils/nakiros-dir.js';

const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'dark',
  language: 'system',
  updatedAt: '',
  agentProvider: 'claude',
  agentChannel: 'stable',
  desktopNotificationsEnabled: true,
  desktopNotificationMinDurationSeconds: 60,
};

function storagePath(): string {
  return nakirosFile('preferences.json');
}

function clampNotificationThreshold(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 60;
  return Math.min(3600, Math.max(0, Math.round(value)));
}

export function getPreferences(): AppPreferences {
  const path = storagePath();
  if (!existsSync(path)) return DEFAULT_PREFERENCES;

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<AppPreferences>;
    const agentProvider =
      parsed.agentProvider === 'claude'
      || parsed.agentProvider === 'codex'
      || parsed.agentProvider === 'cursor'
        ? parsed.agentProvider
        : 'claude';
    const agentChannel =
      parsed.agentChannel === 'stable' || parsed.agentChannel === 'beta'
        ? parsed.agentChannel
        : 'stable';
    return {
      theme: 'dark',
      language: parsed.language ?? 'system',
      updatedAt: parsed.updatedAt ?? '',
      mcpServerUrl: parsed.mcpServerUrl,
      agentProvider,
      agentChannel,
      desktopNotificationsEnabled: parsed.desktopNotificationsEnabled !== false,
      desktopNotificationMinDurationSeconds: clampNotificationThreshold(parsed.desktopNotificationMinDurationSeconds),
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
    agentProvider: prefs.agentProvider ?? 'claude',
    agentChannel: prefs.agentChannel ?? 'stable',
    desktopNotificationsEnabled: prefs.desktopNotificationsEnabled !== false,
    desktopNotificationMinDurationSeconds: clampNotificationThreshold(prefs.desktopNotificationMinDurationSeconds),
  };
  writeFileSync(storagePath(), JSON.stringify(next, null, 2), 'utf-8');
}

export function getSystemLanguage(): 'fr' | 'en' {
  const locale = process.env.LANG ?? process.env.LC_ALL ?? 'en';
  return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
