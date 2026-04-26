# useAgentRunNavigation.tsx

**Path:** `apps/frontend/src/hooks/useAgentRunNavigation.tsx`

React context exposing the App-level "open this run's native screen" implementation to any descendant `RunsCenter`. Centralises routing logic in `App.tsx` without prop-drilling the callback through every view.

## Exports

### `function AgentRunNavigationProvider`

```ts
export function AgentRunNavigationProvider(props: {
  navigate: (run: AgentRun) => void;
  children: ReactNode;
}): JSX.Element
```

Wraps the App's render output. The single host (`App.tsx`) decides how to route — typically: queue an `agentRunFocus` request, then `setView({ name: ... })`, optionally open a project tab.

### `function useAgentRunNavigation`

```ts
export function useAgentRunNavigation(): (run: AgentRun) => void
```

Returns the navigate function from context — or a no-op when no provider is mounted, so the same `RunsCenter` works inside Storybook / playground setups.
