import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AppPreferences } from '@nakiros/shared';

interface PreferencesContextValue {
  preferences: AppPreferences;
  updatePreferences(next: AppPreferences): Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

interface PreferencesProviderProps {
  preferences: AppPreferences;
  updatePreferences(next: AppPreferences): Promise<void>;
  children: ReactNode;
}

/**
 * Context provider exposing the current `AppPreferences` and an async
 * `updatePreferences` mutator to the React tree. Memoizes the value so
 * consumers only re-render when the preferences object identity changes.
 */
export function PreferencesProvider({
  preferences,
  updatePreferences,
  children,
}: PreferencesProviderProps) {
  const value = useMemo(
    () => ({ preferences, updatePreferences }),
    [preferences, updatePreferences],
  );
  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

/**
 * Reads the preferences context. Throws if invoked outside
 * `PreferencesProvider` so missed wiring fails loudly during development.
 */
export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used inside PreferencesProvider');
  }
  return context;
}
