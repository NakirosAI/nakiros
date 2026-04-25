# Select.tsx

**Path:** `apps/frontend/src/components/ui/Select.tsx`

Themed native `<select>` wrapped in a `FormField`. Driven by an `options` array rather than `children` so consumers don't have to deal with `<option>` JSX.

## Exports

### `interface SelectOption`

Single entry in a `Select` dropdown.

```ts
export interface SelectOption {
  /** Submitted value. */
  value: string
  /** User-facing label. */
  label: string
  /** When true, the option cannot be selected. */
  disabled?: boolean
}
```

### `interface SelectProps`

Props accepted by the `Select` component.

```ts
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  /** Optional label rendered by the wrapping FormField. */
  label?: ReactNode
  /** Helper text displayed below the select when no error is set. */
  hint?: ReactNode
  /** Error message; replaces the hint and turns the border red. */
  error?: ReactNode
  /** Available options rendered as native <option> elements. */
  options: SelectOption[]
  /** Class applied to the FormField container. */
  containerClassName?: string
}
```

### `Select`

```ts
const Select: ForwardRefExoticComponent<SelectProps & RefAttributes<HTMLSelectElement>>
```

Forwards its ref to the underlying `<select>`. A custom caret is rendered on the right via an absolutely-positioned span.
