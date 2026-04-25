import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import { FormField } from './FormField';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Optional label rendered by the wrapping {@link FormField}. */
  label?: ReactNode;
  /** Helper text displayed below the textarea when no error is set. */
  hint?: ReactNode;
  /** Error message; replaces the hint and turns the border red. */
  error?: ReactNode;
  /** Class applied to the {@link FormField} container. */
  containerClassName?: string;
}

/**
 * Themed multi-line text input wrapped in a {@link FormField}. Defaults to 4
 * rows and is vertically resizable. Forwards its ref to the underlying
 * `<textarea>`.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, containerClassName, id, rows = 4, ...props },
  ref,
) {
  return (
    <FormField label={label} hint={hint} error={error} htmlFor={id} className={containerClassName}>
      <textarea
        id={id}
        ref={ref}
        rows={rows}
        className={clsx(
          'ui-form-control w-full resize-y rounded-md border bg-[var(--bg-soft)] px-2.5 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)]',
          'focus:border-[var(--primary)] focus:outline-none focus-visible:outline-none focus-visible:ring-0',
          error ? 'border-[var(--danger)]' : 'border-[var(--line)]',
          className,
        )}
        {...props}
      />
    </FormField>
  );
});
