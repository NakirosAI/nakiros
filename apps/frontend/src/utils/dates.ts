/**
 * Retourne le nombre de jours écoulés depuis `lastModifiedAt` (timestamp ms).
 * Retourne null si la date est absente.
 */
export function getDaysAgo(lastModifiedAt?: number): number | null {
  if (!lastModifiedAt) return null;
  return Math.floor((Date.now() - lastModifiedAt) / (1000 * 60 * 60 * 24));
}

/**
 * Couleur de fraîcheur d'un document selon son âge en jours.
 */
export function freshnessColor(days: number): string {
  if (days < 3) return 'var(--text-muted)';
  if (days < 7) return '#f59e0b';
  return '#ef4444';
}

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Label de fraîcheur d'un document via useTranslation('context').
 * Clés : freshnessGenerated / freshnessModified avec pluralisation (_zero/_one/_other).
 */
export function freshnessLabel(days: number, isGenerated: boolean, t: TFunc): string {
  const key = isGenerated ? 'freshnessGenerated' : 'freshnessModified';
  return t(key, { count: days });
}

/**
 * Temps relatif court depuis une date ISO via useTranslation('settings').
 * Clés : timeAgoNow, timeAgoMinutes, timeAgoHours, timeAgoDays.
 */
export function formatLastCheck(iso: string, t: TFunc): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (days > 0) return t('timeAgoDays', { count: days });
  if (hours > 0) return t('timeAgoHours', { count: hours });
  if (minutes > 0) return t('timeAgoMinutes', { count: minutes });
  return t('timeAgoNow');
}
