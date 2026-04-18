import type { IpcChannel } from '@nakiros/shared';
import { preferencesHandlers } from './preferences.js';

export type IpcHandler = (args: unknown[]) => Promise<unknown> | unknown;

export type HandlerRegistry = Partial<Record<IpcChannel, IpcHandler>>;

export function buildHandlerRegistry(): HandlerRegistry {
  return {
    ...preferencesHandlers,
  };
}
