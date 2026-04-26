import type { AppPreferences } from '@nakiros/shared';
import {
  getPreferences,
  getSystemLanguage,
  savePreferences,
} from '../../services/preferences.js';
import { createTypedHandler } from './run-helpers.js';
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
  'preferences:get': createTypedHandler(getPreferences),
  'preferences:getSystemLanguage': createTypedHandler(getSystemLanguage),
  'preferences:save': createTypedHandler((prefs: AppPreferences) => savePreferences(prefs)),
};
