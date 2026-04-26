import { getVersionInfo } from '../../services/version-service.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * Registers the `meta:*` IPC channels.
 *
 * Channels:
 * - `meta:getVersionInfo` — returns current installed version + latest npm version (optional `force` bypasses cache)
 */
export const metaHandlers: HandlerRegistry = {
  'meta:getVersionInfo': createTypedHandler((options?: { force?: boolean }) =>
    getVersionInfo({ force: Boolean(options?.force) }),
  ),
};
