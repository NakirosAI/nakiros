# progress.tsx

**Path:** `apps/frontend/src/components/ui/progress.tsx`

Themed horizontal progress bar built on the Radix `Progress` primitive. Used to surface long-running operations (eval runs, fix runs, audits).

## Exports

### `Progress`

```ts
function Progress(props: React.ComponentProps<typeof ProgressPrimitive.Root>): JSX.Element
```

The indicator is translated by `100 - value` percent, so the bar fills from the left as `value` grows from 0 to 100. `value` falls back to 0 when undefined.
