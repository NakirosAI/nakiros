import type { DriftHookDiff, DriftHookStatus } from '@nakiros/shared';

import {
  buildDriftHookDiff,
  getDriftHookStatus,
  installDriftHook,
  uninstallDriftHook,
} from '../../services/drift/hook-installer.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * `driftHook:*` IPC channels — manage the optional Stop + UserPromptSubmit
 * hook pair that surfaces drift signals inside Claude Code conversations.
 *
 * Channels:
 *   - `driftHook:status`    — current installation state (polled on mount)
 *   - `driftHook:diff`      — JSON diff shown to the user before enabling
 *   - `driftHook:install`   — idempotent install of both hooks + CJS scripts
 *   - `driftHook:uninstall` — idempotent removal of both hooks + CJS scripts
 */
export const driftHookHandlers: HandlerRegistry = {
  'driftHook:status': createTypedHandler(
    (): DriftHookStatus => getDriftHookStatus(),
  ),

  'driftHook:diff': createTypedHandler(
    (): DriftHookDiff => buildDriftHookDiff(),
  ),

  'driftHook:install': createTypedHandler(
    (): DriftHookStatus => installDriftHook(),
  ),

  'driftHook:uninstall': createTypedHandler(
    (): DriftHookStatus => uninstallDriftHook(),
  ),
};
