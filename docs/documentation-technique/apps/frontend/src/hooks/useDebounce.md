# useDebounce.ts

**Path:** `apps/frontend/src/hooks/useDebounce.ts`

Trivial debounce primitive used by search inputs and other rate-limited
filters in the frontend. Each new input cancels the pending timeout via
`window.clearTimeout`.

## Exports

### `useDebounce`

```ts
function useDebounce<T>(value: T, delay: number): T
```

Returns a debounced copy of `value` that only updates after `delay` ms have
passed without further changes.
