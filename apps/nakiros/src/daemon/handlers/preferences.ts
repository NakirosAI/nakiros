import type { AppPreferences } from '@nakiros/shared';
import {
  getPreferences,
  getSystemLanguage,
  savePreferences,
} from '../../services/preferences.js';
import type { HandlerRegistry } from './index.js';

export const preferencesHandlers: HandlerRegistry = {
  'preferences:get': () => getPreferences(),
  'preferences:getSystemLanguage': () => getSystemLanguage(),
  'preferences:save': (args) => {
    const prefs = args[0] as AppPreferences;
    savePreferences(prefs);
  },
};
