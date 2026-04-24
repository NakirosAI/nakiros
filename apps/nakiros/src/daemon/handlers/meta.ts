import { getVersionInfo } from '../../services/version-service.js';
import type { HandlerRegistry } from './index.js';

/**
 * Registers the `meta:*` IPC channels.
 *
 * Channels:
 * - `meta:getVersionInfo` — returns current installed version + latest npm version (optional `force` bypasses cache)
 */
export const metaHandlers: HandlerRegistry = {
  'meta:getVersionInfo': (args) => {
    const force = Boolean((args[0] as { force?: boolean } | undefined)?.force);
    return getVersionInfo({ force });
  },
};
