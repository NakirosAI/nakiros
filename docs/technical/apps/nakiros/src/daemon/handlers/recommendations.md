# recommendations.ts

**Path:** `apps/nakiros/src/daemon/handlers/recommendations.ts`

Domain handler bundle for the friction-pattern recommendation feature. Registers all `recommendations:*` IPC channels that connect the frontend card UI to the clustering, analyser runner, and apply-reco service layers.

## IPC channels

- `recommendations:listPatterns` — return stored patterns for the project, or recompute from cached analyses on first call
- `recommendations:getPattern` — return a single pattern by id together with all its reco cards
- `recommendations:refresh` — force-recompute patterns from cached analyses and return updated count
- `recommendations:analyzePattern` — start (or rebind to) an LLM analyser run for a pattern; returns `{ runId }` immediately
- `recommendations:stopAnalyze` — cancel an in-flight analyser run; no-op for terminal runs
- `recommendations:applyReco` — spawn a downstream fix/edit/create run for a reco card; idempotent
- `recommendations:dismissReco` — mark a card as dismissed without spawning any run
- `recommendations:editRecoBrief` — replace the "## Brief" section of a card's markdown body in-place

**Broadcasts:**
- `recommendations:event` — streamed `RecommendationAnalyzeRunEvent` from active analyser runs

## Exports

### `recommendationsHandlers`

```ts
export const recommendationsHandlers: HandlerRegistry
```

Domain handler map. Spread into `buildHandlerRegistry()` in `handlers/index.ts`. Each entry is a `createTypedHandler`-wrapped function; `recommendations:stopAnalyze` is additionally wrapped by `withBroadcastOnError` to broadcast a `{ type: 'error' }` payload if the stop call throws before the runner can emit any event.

---

### `getRecommendationAnalyzeBufferedEvents`

```ts
export { getRecommendationAnalyzeBufferedEvents }
```

Re-export of `getRecommendationAnalyzeBufferedEvents` from `recommendation-analyze-runner.ts`. Exposed here so `server.ts` can import from a single handlers module rather than reaching into the runner directly. Used at daemon boot to replay buffered events for reconnecting frontend tabs.
