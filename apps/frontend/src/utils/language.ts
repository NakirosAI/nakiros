import type { LanguagePreference, ResolvedLanguage } from '@nakiros/shared';

/**
 * Resolves a `LanguagePreference` (`'fr' | 'en' | 'system'`) into a concrete
 * `ResolvedLanguage`. For `'system'`, falls back to `navigator.language`:
 * anything starting with `fr` → `'fr'`, otherwise `'en'`.
 */
export function resolveLanguage(
  preference: LanguagePreference,
  systemLanguage = navigator.language,
): ResolvedLanguage {
  if (preference === 'fr' || preference === 'en') return preference;
  return systemLanguage.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
