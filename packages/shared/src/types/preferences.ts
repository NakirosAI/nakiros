export type ThemePreference = 'system' | 'light' | 'dark';
export type LanguagePreference = 'system' | 'fr' | 'en';
export type ResolvedTheme = 'light' | 'dark';
export type ResolvedLanguage = 'fr' | 'en';
export type AgentProvider = 'claude' | 'codex' | 'cursor';

export const DEFAULT_MCP_SERVER_URL = 'http://localhost:3737';

export interface AppPreferences {
  theme: ThemePreference;
  language: LanguagePreference;
  updatedAt: string;
  mcpServerUrl?: string;
  agentProvider?: AgentProvider;
  agentChannel?: 'stable' | 'beta';
  desktopNotificationsEnabled?: boolean;
  desktopNotificationMinDurationSeconds?: number;
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  theme: 'dark',
  language: 'system',
  updatedAt: '',
  agentProvider: 'claude',
  desktopNotificationsEnabled: true,
  desktopNotificationMinDurationSeconds: 60,
};
