# agent-run-focus.ts

**Path:** `apps/frontend/src/lib/agent-run-focus.ts`

Tiny ad-hoc bus used by `RunsCenter` → destination view to express "after the next navigation, focus this run". The destination view consumes the value once on its first skill-load tick and clears it.

Intentionally kept off React state so calling code (App.tsx) can fire `set(run)` before triggering the route switch — by the time the new view mounts its effects, the focus is already queued.

## Exports

### `const agentRunFocus`

```ts
export const agentRunFocus: {
  set(run: AgentRun | null): void;
  consume(): AgentRun | null;
  subscribe(fn: () => void): () => void;
}
```

`subscribe` is used by views that may already be mounted when focus is set (e.g. user is already on the right scope's skills view and clicks a run from the topbar). Views gate their consume on `!loading && skills.length > 0` so the focus is never dropped.
