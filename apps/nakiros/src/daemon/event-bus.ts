import { EventEmitter } from 'node:events';

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

export const eventBus = new EventBus();
eventBus.setMaxListeners(0);
