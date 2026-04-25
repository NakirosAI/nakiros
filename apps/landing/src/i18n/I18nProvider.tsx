import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './locales/en.json';
import fr from './locales/fr.json';

/** Locales supported by the landing page. */
export type Locale = 'en' | 'fr';

/**
 * Shape of the translation bundle.
 *
 * Inferred from the English JSON file so adding a new key triggers a
 * type error in the French file until it is translated.
 */
export type Messages = typeof en;

const LOCALES: Record<Locale, Messages> = { en, fr };
const STORAGE_KEY = 'nakiros-landing-locale';

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'fr') return stored;
  const nav = window.navigator.language.toLowerCase();
  return nav.startsWith('fr') ? 'fr' : 'en';
}

interface I18nContextValue {
  locale: Locale;
  messages: Messages;
  setLocale(locale: Locale): void;
  availableLocales: Locale[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Root i18n provider for the landing page.
 *
 * Detects the initial locale from `localStorage` (`nakiros-landing-locale`)
 * with a fallback to `navigator.language` ("fr*" → fr, otherwise en). Persists
 * the active locale to `localStorage` and reflects it on
 * `document.documentElement.lang` whenever it changes. Wraps the app in
 * `main.tsx` so every component below can call {@link useI18n}.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectInitialLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      messages: LOCALES[locale],
      setLocale: setLocaleState,
      availableLocales: ['en', 'fr'],
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Hook returning the active locale, its messages, and the locale setter.
 *
 * Throws if called outside an {@link I18nProvider} — every landing component
 * relies on it being mounted at the root in `main.tsx`.
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
