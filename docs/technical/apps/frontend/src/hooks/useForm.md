# useForm.ts

**Path:** `apps/frontend/src/hooks/useForm.ts`

Lightweight controlled-form helper. Holds values, derives errors from an
optional sync validator, and resyncs to fresh `initialValues` when the
parent passes a new reference.

## Exports

### `useForm`

```ts
function useForm<T extends Record<string, unknown>>(
  initialValues: T,
  validate?: (values: T) => Partial<Record<keyof T, string>>,
): {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  handleChange<K extends keyof T>(key: K, value: T[K]): void;
  reset(): void;
  isValid: boolean;
};
```

Validates on every change. `isValid` is `true` when every error slot is
empty. Re-validates from scratch whenever `initialValues` or `validate`
identity changes.
