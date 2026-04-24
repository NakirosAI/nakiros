import open from 'open';
import type { HandlerRegistry } from './index.js';

/**
 * Registers the `shell:*` IPC channels.
 *
 * Channels:
 * - `shell:openPath` — opens a file or URL with the OS default handler (via the `open` package)
 */
export const shellHandlers: HandlerRegistry = {
  'shell:openPath': async (args) => {
    const path = args[0] as string;
    if (typeof path !== 'string' || !path) return;
    await open(path);
  },
};
