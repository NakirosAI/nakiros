import type { AppPreferences } from '@nakiros/shared';
import {
  getPreferences,
  getSystemLanguage,
  savePreferences,
} from '../../services/preferences.js';
import type { HandlerRegistry } from './index.js';

/**
 * Registers the `preferences:*` IPC channels.
 *
 * Channels:
 * - `preferences:get` — returns persisted {@link AppPreferences} from `~/.nakiros/`
 * - `preferences:getSystemLanguage` — returns the detected OS locale (used to resolve `language: 'system'`)
 * - `preferences:save` — overwrites the stored preferences file
 */
export const preferencesHandlers: HandlerRegistry = {
  'preferences:get': () => getPreferences(),
  'preferences:getSystemLanguage': () => getSystemLanguage(),
  'preferences:save': (args) => {
    const prefs = args[0] as AppPreferences;
    savePreferences(prefs);
  },
};
