# FormField.tsx

**Path:** `apps/frontend/src/components/ui/FormField.tsx`

Vertical form group used internally by `Input`, `Select` and `Textarea` to render the label / control / hint-or-error layout. Rarely used directly by feature code — prefer the higher-level inputs.

## Exports

### `FormField`

```ts
export function FormField(props: FormFieldProps): JSX.Element
```

Renders an uppercase label, the input child(ren), and either an error message (priority) or a helper hint underneath. The error message replaces the hint when present.

**Parameters:**
- `label` — uppercase tracked label rendered above the field.
- `hint` — muted helper text shown when no `error` is set.
- `error` — error text; takes precedence over `hint`.
- `htmlFor` — forwarded to the `<label htmlFor>` attribute.
- `required` — when true, appends a red asterisk to the label.
- `children` — the actual form control(s).
