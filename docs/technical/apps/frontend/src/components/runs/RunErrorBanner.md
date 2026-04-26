# RunErrorBanner.tsx

**Path:** `apps/frontend/src/components/runs/RunErrorBanner.tsx`

Inline banner surfacing a terminal error from a run. Shared across all run kinds (audit / fix / create / eval) so they look identical.

## Exports

### `RunErrorBanner`

```ts
export function RunErrorBanner(props: {
  message: string | null | undefined;
  title?: string;
}): JSX.Element | null
```

Returns `null` when `message` is falsy. Otherwise renders a red bordered panel with a `<AlertTriangle>` heading (translated from `runs:error.title` by default; `title` override available when a kind-specific label fits better, e.g. `t('errorLabel')` on the eval side).
