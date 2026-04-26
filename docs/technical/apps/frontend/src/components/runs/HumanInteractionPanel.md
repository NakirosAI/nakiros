# HumanInteractionPanel.tsx

**Path:** `apps/frontend/src/components/runs/HumanInteractionPanel.tsx`

Permanent input bar for the human-in-the-loop interaction with any agent run. Renders a textarea + Send button and toggles between three states (waiting / running / idle) with shared copy from the `runs` i18n namespace.

Used by `AuditView`, `FixView` (fix + create modes), `EvalRunsView` and any future run kind that exposes `canSendMessage`.

## Exports

### `HumanInteractionPanel`

```ts
export function HumanInteractionPanel(props: {
  isWaiting: boolean;
  isRunning?: boolean;
  onSend(message: string): Promise<void>;
  placeholderWaiting?: string;
  placeholderRunning?: string;
  placeholderIdle?: string;
  waitingBanner?: string;
  extraButtons?: ReactNode;
}): JSX.Element
```

Owns the textarea local state (`value`, `sending`). Calls `onSend(trimmed)` on Enter (without Shift) or Send-button click. Re-prefills the textarea and surfaces a translated `runs:input.sendFailed` `alert()` when `onSend` throws. Disables the textarea when `isRunning && !isWaiting` to avoid the agent swallowing the message mid-turn. The `extraButtons` slot stacks vertically next to Send (eval uses it for the Flag/Finish button).

The banner switches style: waiting → amber border + "Agent is waiting for your input" copy; otherwise → neutral muted-soft border. Placeholders default to `runs:input.placeholderWaiting | placeholderRunning | placeholderIdle` and can be overridden per call site for kind-specific copy.
