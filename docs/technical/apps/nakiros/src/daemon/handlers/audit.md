# audit.ts

**Path:** `apps/nakiros/src/daemon/handlers/audit.ts`

Registers the `audit:*` IPC channels — static skill review via the `/nakiros-skill-factory audit` flow. The run produces a report archived under `{skill}/audits/audit-<ts>.md`.

## IPC channels

### Lifecycle
- `audit:start`, `audit:stopRun`, `audit:getRun`, `audit:finish`

### Stream
- `audit:sendUserMessage`, `audit:listActive`, `audit:listAll`, `audit:getBufferedEvents`

`audit:listActive` filters to non-terminal runs (used by per-skill badges); `audit:listAll` returns the full registry — active **and** recently terminal — so the runs center can surface restored / completed audits for the user to dismiss.

### History
- `audit:listHistory` — archived reports under `{skill}/audits/`
- `audit:readReport` — content of one archived report

## Broadcasts

- `audit:event` — streams lifecycle + text + tool events while runs are active. The `error` variant is broadcast by `withBroadcastOnError` when an `audit:*` handler that mutates a known run throws (e.g. `audit:sendUserMessage`, `audit:stopRun`, `audit:finish`) — the IPC response still rejects, but the frontend's subscription gets an out-of-band signal so the view can surface the error inline. `audit:start` is intentionally not wrapped (no runId yet — the HTTP error is the only useful signal).

## Exports

### `const auditHandlers`

```ts
export const auditHandlers: HandlerRegistry
```
