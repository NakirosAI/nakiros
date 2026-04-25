import { EventEmitter } from 'node:events';

/** Wire format for every broadcast flowing from a runner/handler to the WebSocket. */
export interface BroadcastMessage {
  channel: string;
  payload: unknown;
}

class EventBus extends EventEmitter {
  broadcast(channel: string, payload: unknown): void {
    this.emit('broadcast', { channel, payload } satisfies BroadcastMessage);
  }

  onBroadcast(listener: (msg: BroadcastMessage) => void): () => void {
    this.on('broadcast', listener);
    return () => {
      this.off('broadcast', listener);
    };
  }
}

/**
 * Shared event-bus singleton. Runners call `broadcast(channel, payload)` to
 * push events that the daemon's `/ws` WebSocket handler fans out to every
 * connected client. `setMaxListeners(0)` is set because every WebSocket
 * connection attaches its own listener.
 *
 * Do NOT import from `electron` — the daemon is plain Node ESM.
 */
export const eventBus = new EventBus();
eventBus.setMaxListeners(0);
