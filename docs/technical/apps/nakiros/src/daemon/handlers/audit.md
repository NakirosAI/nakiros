# audit.ts

**Path:** `apps/nakiros/src/daemon/handlers/audit.ts`

Registers the `audit:*` IPC channels — static skill review via the `/nakiros-skill-factory audit` flow. The run produces a report archived under `{skill}/audits/audit-<ts>.md`.

## IPC channels

### Lifecycle
- `audit:start`, `audit:stopRun`, `audit:getRun`, `audit:finish`

### Stream
- `audit:sendUserMessage`, `audit:listActive`, `audit:getBufferedEvents`

### History
- `audit:listHistory` — archived reports under `{skill}/audits/`
- `audit:readReport` — content of one archived report

## Broadcasts

- `audit:event` — streams lifecycle + text + tool events while runs are active.

## Exports

### `const auditHandlers`

```ts
export const auditHandlers: HandlerRegistry
```
