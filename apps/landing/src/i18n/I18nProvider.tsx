import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './locales/en.json';
import fr from './locales/fr.json';

export type Locale = 'en' | 'fr';
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

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
