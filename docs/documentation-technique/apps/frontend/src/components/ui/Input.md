# Input.tsx

**Path:** `apps/frontend/src/components/ui/Input.tsx`

Themed text input wrapped in a `FormField`. Standard control for short single-line text in the Nakiros frontend; supports an optional leading icon and the label / hint / error pattern.

## Exports

### `interface InputProps`

Props accepted by the `Input` component.

```ts
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Optional label rendered by the wrapping FormField. */
  label?: ReactNode
  /** Helper text displayed below the input when no error is set. */
  hint?: ReactNode
  /** Error message; replaces the hint and turns the border red. */
  error?: ReactNode
  /** Leading icon, absolutely positioned inside the input on the left. */
  icon?: ReactNode
  /** Class applied to the FormField container, not to <input>. */
  containerClassName?: string
}
```

### `Input`

```ts
const Input: ForwardRefExoticComponent<InputProps & RefAttributes<HTMLInputElement>>
```

Forwards its ref to the underlying `<input>` so consumers can focus or measure it. Adds left padding when `icon` is present.
