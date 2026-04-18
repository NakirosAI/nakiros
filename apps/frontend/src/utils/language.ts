import type { LanguagePreference, ResolvedLanguage } from '@nakiros/shared';

export function resolveLanguage(
  preference: LanguagePreference,
  systemLanguage = navigator.language,
): ResolvedLanguage {
  if (preference === 'fr' || preference === 'en') return preference;
  return systemLanguage.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
