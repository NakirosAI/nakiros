import {
  detectEditors,
  installNakiros,
  nakirosConfigExists,
  type DetectedEditor,
} from '../../services/onboarding-installer.js';
import type { HandlerRegistry } from './index.js';

/**
 * Registers the `onboarding:*` IPC channels used by the Onboarding view.
 *
 * Channels:
 * - `onboarding:detectEditors` — scans the user's machine for Claude / Cursor / Codex installs
 * - `onboarding:nakirosConfigExists` — tells the UI whether onboarding has already run
 * - `onboarding:install` — runs the Nakiros install for a list of selected editors
 */
export const onboardingHandlers: HandlerRegistry = {
  'onboarding:detectEditors': () => detectEditors(),
  'onboarding:nakirosConfigExists': () => nakirosConfigExists(),
  'onboarding:install': (args) => installNakiros(args[0] as DetectedEditor[]),
};
