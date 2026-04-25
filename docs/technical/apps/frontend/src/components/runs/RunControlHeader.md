# RunControlHeader.tsx

**Path:** `apps/frontend/src/components/runs/RunControlHeader.tsx`

Top header shared across every run view. Lays out the Back button + icon + title + `RunStatusBadge` on the left, and the tokens / elapsed stats + caller-defined `actions` / `extras` slots on the right.

## Exports

### `RunControlHeader`

```ts
export function RunControlHeader(props: {
  status: RunBadgeStatus;
  title: ReactNode;
  icon?: ReactNode;
  tokensUsed?: number;
  durationMs: number;
  onBack(): void;
  actions?: ReactNode;
  extras?: ReactNode;
}): JSX.Element
```

Reads `runs:back` for the Back button label. Formats tokens via `formatTokens(value, { unit: 'tok' })` and duration via `formatComputeDuration(durationMs)` from `utils/format`. `actions` is the slot for kind-specific buttons (Stop / Finish / Sync / Discard / RunEvals) — the caller decides which buttons to render based on the run's status. `extras` renders after `actions` and is currently used by `AuditView` for its conversation/report tab switcher.

The header doesn't decide whether to show `elapsed` (live ms) or `durationMs` (final) — the caller passes whichever value matches the run state, typically `isTerminal ? run.durationMs : elapsed`.
