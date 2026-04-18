import type { HandlerRegistry } from './index.js';

/**
 * STUB — real MCP server will be wired in step 3d.
 * For now we always advertise `running` so the frontend status pill doesn't
 * show a broken state.
 */
export const serverStatusHandlers: HandlerRegistry = {
  'server:getStatus': () => 'running',
};
