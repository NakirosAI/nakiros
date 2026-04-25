# ThinkingIndicator.tsx

**Path:** `apps/frontend/src/components/ThinkingIndicator.tsx`

Cycling "thinking" indicator shown while a runner is active but has not streamed anything back yet. Rotates through a list of verbs so the user sees something alive on screen (à la Claude Code's "Thinking…", "Reading…", etc.).

## Exports

### `ThinkingIndicator`

```ts
export function ThinkingIndicator(props: { verbs: string[]; intervalMs?: number }): JSX.Element | null
```

Renders nothing when `verbs` is empty. With a single verb it stays put; with several it rotates every `intervalMs` (default 2500ms). Cleans its own interval on unmount or input change.
