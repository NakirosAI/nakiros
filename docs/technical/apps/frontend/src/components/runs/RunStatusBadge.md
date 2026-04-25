# RunStatusBadge.tsx

**Path:** `apps/frontend/src/components/runs/RunStatusBadge.tsx`

Pill displaying a run's lifecycle status with the right icon, colour and translated label. Status labels live in the shared `runs` i18n namespace so every run kind shares the same vocabulary.

## Exports

### `RunBadgeStatus`

```ts
export type RunBadgeStatus =
  | 'queued' | 'pending'
  | 'starting' | 'running'
  | 'waiting_for_input' | 'awaiting_input'
  | 'grading'
  | 'completed' | 'done'
  | 'failed'
  | 'stopped' | 'cancelled';
```

Union of every status string emitted by Nakiros runners (audit / fix / create / eval) plus the unified `AgentRunStatus`. The badge handles them all so any caller can pass its native runner status as-is.

### `RunStatusBadge`

```ts
export function RunStatusBadge(props: { status: RunBadgeStatus; className?: string }): JSX.Element
```

Renders a coloured pill with an icon + a label translated from `runs:status.<status>`. Used by `RunControlHeader` and any other surface that needs the full pill (vs the icon-only `RunStatusIcon`).
