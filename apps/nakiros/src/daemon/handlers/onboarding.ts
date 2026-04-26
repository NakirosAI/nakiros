import type { DetectedEditor } from '@nakiros/shared';

import {
  detectEditors,
  installNakiros,
  nakirosConfigExists,
} from '../../services/onboarding-installer.js';
import { createTypedHandler } from './run-helpers.js';
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
  'onboarding:detectEditors': createTypedHandler(detectEditors),
  'onboarding:nakirosConfigExists': createTypedHandler(nakirosConfigExists),
  'onboarding:install': createTypedHandler((editors: DetectedEditor[]) => installNakiros(editors)),
};
