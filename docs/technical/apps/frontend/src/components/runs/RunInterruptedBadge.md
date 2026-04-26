# RunInterruptedBadge.tsx

**Path:** `apps/frontend/src/components/runs/RunInterruptedBadge.tsx`

Small amber badge surfaced next to {@link RunStatusBadge} when a run was collapsed back to `waiting_for_input` after a daemon reboot rather than having genuinely asked for user input. Pairs with the "Reprendre" action in `RunControlHeader` so the user knows they can resume the interrupted conversation.

The component renders nothing when `interrupted` is falsy — callers pass `run.interruptedByReboot` directly without a guard.

## Exports

### `RunInterruptedBadge`

```ts
export function RunInterruptedBadge({ interrupted }: { interrupted: boolean | undefined }): JSX.Element | null
```

Renders a `<AlertTriangle>` icon + translated `runs:interruptedBadge` label inside an amber pill. Tooltip surfaces `runs:interruptedTooltip` so the user understands what triggered the badge. Returns `null` when `interrupted` is falsy.
