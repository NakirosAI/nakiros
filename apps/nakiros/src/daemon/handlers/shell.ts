import open from 'open';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * Registers the `shell:*` IPC channels.
 *
 * Channels:
 * - `shell:openPath` — opens a file or URL with the OS default handler (via the `open` package)
 */
export const shellHandlers: HandlerRegistry = {
  'shell:openPath': createTypedHandler(async (path: string) => {
    if (typeof path !== 'string' || !path) return;
    await open(path);
  }),
};
