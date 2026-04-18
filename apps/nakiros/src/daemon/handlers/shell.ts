import open from 'open';
import type { HandlerRegistry } from './index.js';

export const shellHandlers: HandlerRegistry = {
  'shell:openPath': async (args) => {
    const path = args[0] as string;
    if (typeof path !== 'string' || !path) return;
    await open(path);
  },
};
