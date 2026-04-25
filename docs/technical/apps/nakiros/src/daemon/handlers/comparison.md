# comparison.ts

**Path:** `apps/nakiros/src/daemon/handlers/comparison.ts`

Registers the `comparison:*` IPC channels — A/B/C eval comparison across Haiku / Sonnet / Opus for a single skill snapshot. Comparison runs reuse the eval runner under the hood, so their events flow through the same `eval:event` broadcast.

## IPC channels

- `comparison:run` — launch a new comparison; returns `{ comparisonId, runIds, reuseSummary }` (which models were reused from Evolution iterations vs launched fresh)
- `comparison:list` — existing comparisons stored under `{skillDir}/evals/comparisons/`
- `comparison:getMatrix` — full per-model matrix for one comparison
- `comparison:getFingerprintStatus` — pre-flight info so the UI can warn if the skill changed since the last iteration (Opus will be re-run instead of reused)

## Broadcasts

- `eval:event` — comparison runs piggyback on the eval-event channel.

## Exports

### `const comparisonHandlers`

```ts
export const comparisonHandlers: HandlerRegistry
```
