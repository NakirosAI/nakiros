import type { TFunction } from 'i18next';

export function formatJiraError(t: TFunction<'settings'>, error: string | null | undefined): string | null {
  if (!error) return null;

  const normalized = error.toLowerCase();

  if (normalized.includes('secure storage is unavailable')) {
    return t('jiraErrorSecureStorage');
  }
  if (normalized.includes('stored jira credentials are no longer readable')) {
    return t('jiraErrorReconnect');
  }
  if (normalized.includes('not connected to jira') || normalized.includes('reconnect')) {
    return t('jiraErrorReconnect');
  }
  if (normalized.includes('token refresh failed') || normalized.includes('oauth') || normalized.includes('auth')) {
    return t('jiraErrorAuthExpired');
  }
  if (normalized.includes('failed to fetch') || normalized.includes('network') || normalized.includes('timed out')) {
    return t('jiraErrorNetwork');
  }
  return t('jiraErrorGeneric');
}
