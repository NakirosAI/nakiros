# event-bus.ts

**Path:** `apps/nakiros/src/daemon/event-bus.ts`

Shared in-process event bus used by every runner/handler to push broadcasts. The daemon's `/ws` WebSocket fans every broadcast out to connected clients. Do NOT import from `electron` — the daemon is plain Node ESM.

## Exports

### `interface BroadcastMessage`

Wire format for every broadcast flowing from a runner/handler to the WebSocket.

```ts
export interface BroadcastMessage {
  channel: string;
  payload: unknown;
}
```

### `const eventBus`

Shared event-bus singleton. Runners call `broadcast(channel, payload)` to push events the WebSocket fans out. `setMaxListeners(0)` so every WS connection can attach its own listener without warnings.

```ts
export const eventBus: {
  broadcast(channel: string, payload: unknown): void;
  onBroadcast(listener: (msg: BroadcastMessage) => void): () => void;
};
```
