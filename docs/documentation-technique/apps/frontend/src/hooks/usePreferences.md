# usePreferences.tsx

**Path:** `apps/frontend/src/hooks/usePreferences.tsx`

React context that exposes the current `AppPreferences` and an async
`updatePreferences` mutator to the tree. The shell wires real handlers;
inner views consume the context instead of prop drilling.

## Exports

### `PreferencesProvider`

```ts
function PreferencesProvider(props: {
  preferences: AppPreferences;
  updatePreferences(next: AppPreferences): Promise<void>;
  children: ReactNode;
}): JSX.Element;
```

Context provider memoizing `{ preferences, updatePreferences }`.

### `usePreferences`

```ts
function usePreferences(): {
  preferences: AppPreferences;
  updatePreferences(next: AppPreferences): Promise<void>;
};
```

Reads the context. Throws if invoked outside `PreferencesProvider`.
