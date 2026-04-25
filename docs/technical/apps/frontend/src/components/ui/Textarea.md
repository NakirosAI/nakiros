# Textarea.tsx

**Path:** `apps/frontend/src/components/ui/Textarea.tsx`

Themed multi-line text input wrapped in a `FormField`. Used for skill prompts, descriptions and other long-form fields.

## Exports

### `interface TextareaProps`

Props accepted by the `Textarea` component.

```ts
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Optional label rendered by the wrapping FormField. */
  label?: ReactNode
  /** Helper text displayed below the textarea when no error is set. */
  hint?: ReactNode
  /** Error message; replaces the hint and turns the border red. */
  error?: ReactNode
  /** Class applied to the FormField container. */
  containerClassName?: string
}
```

### `Textarea`

```ts
const Textarea: ForwardRefExoticComponent<TextareaProps & RefAttributes<HTMLTextAreaElement>>
```

Defaults to 4 rows and is vertically resizable. Forwards its ref to the underlying `<textarea>`.
