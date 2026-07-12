# BootstrapComposer.tsx

**Path:** `apps/frontend/src/components/bootstrap/BootstrapComposer.tsx`

Chat composer for the bootstrap discuss step — a native `n-*`-styled
equivalent of `components/runs/HumanInteractionPanel.tsx` (that component
hardcodes legacy `--line` / `--bg-soft` CSS vars which aren't defined on
the new design, see `.claude/rules/ui-kit.md`). Accepts messages while the
run is `waiting_for_input` **or** `awaiting_approval` — the feature's
decision #3 lets the user keep discussing the plan even once it's ready
for approval.

## Exports

### `BootstrapComposer`

```ts
export function BootstrapComposer(props: Props): JSX.Element
```

Renders a textarea + send button. Enter sends (Shift+Enter for a newline);
the textarea stays visible but disabled while the agent is mid-turn and
not explicitly waiting.

**Props** (`Props`, not exported — local to this file):
- `isWaiting` — `true` while the agent is explicitly waiting (chat reply or plan approval); enables the input and shows the waiting banner.
- `isRunning` — `true` while the agent is mid-turn; combined with `isWaiting` to compute the disabled state.
- `onSend(message)` — async callback invoked with the trimmed message; a thrown error surfaces via `window.alert` and restores the draft.
