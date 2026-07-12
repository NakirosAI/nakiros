# run-api.ts

**Path:** `apps/frontend/src/lib/run-api.ts`

Cross-kind dispatcher for run-related IPC channels. Audit, fix, create,
edit, classify-convo, recommendation-analyze and bootstrap share close
enough daemon-side shapes that a single `useRunState` wiring covers them
all; this module maps an `AgentRunKind` onto the concrete IPC methods to
call. Eval and analyze-convo aren't wired here — they use their own
dedicated pipelines (`EvalRunScreen`, not yet built respectively).

## Exports

### `AuditLikeRun`

```ts
export type AuditLikeRun = AuditRun | ClassifyConvoRun | RecommendationAnalyzeRun | BootstrapRun
```

Common run-state shape the kinds above share. `BootstrapRun` is included
so `getRunAPI('bootstrap')` can return a real `stop` action for the topbar
`RunDock` (its stop button is gated on `getRunAPI(kind) !== null`) — this
does NOT mean bootstrap runs flow through the generic `RunScreen` /
`AuditLikeRunScreen` UI. They don't: `views/BootstrapScreen.tsx` owns
their entire lifecycle standalone (its own `useRunState` wiring, plan/
approval panel), and `NewShell.handleOpenRun` routes a `kind: 'bootstrap'`
`AgentRun` to the project's Bootstrap view instead of ever opening a
`kind: 'run'` tab for it.

### `AuditLikeEvent`

```ts
export type AuditLikeEvent = AuditRunEvent['event'] | ClassifyConvoRunEvent['event'] | RecommendationAnalyzeRunEvent['event'] | BootstrapRunEvent['event']
```

Union of the inner event payloads for the kinds above.

### `interface RunUserActions`

The three user-triggerable actions every wired kind exposes: `sendUserMessage`, `stop`, `finish`.

### `interface KindRunAPI`

Bundles a `RunStateApi<AuditLikeRun, AuditLikeEvent>` (`state`), a `RunUserActions` (`actions`), and an optional `readReport` — the markdown-report reader for kinds that write one (only audit does; fix/create/edit/classify-convo/recommendation-analyze/bootstrap return `null`, their terminal artefact is rendered another way or not exposed by this dispatcher at all).

### `getRunAPI`

```ts
export function getRunAPI(kind: AgentRunKind): KindRunAPI | null
```

Returns the channel triplet for a given kind, or `null` for kinds this
dispatcher doesn't wire (`eval`, `analyze-convo`). The `bootstrap` case
exists purely to satisfy `RunDock`'s stop button — see `AuditLikeRun`'s doc
above for why bootstrap otherwise bypasses this module's consumers
(`RunScreen.tsx`).
