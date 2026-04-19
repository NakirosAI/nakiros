import { getVersionInfo } from '../../services/version-service.js';
import type { HandlerRegistry } from './index.js';

export const metaHandlers: HandlerRegistry = {
  'meta:getVersionInfo': (args) => {
    const force = Boolean((args[0] as { force?: boolean } | undefined)?.force);
    return getVersionInfo({ force });
  },
};
