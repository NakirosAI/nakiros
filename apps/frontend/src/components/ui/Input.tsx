import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { FormField } from './FormField';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Optional label rendered by the wrapping {@link FormField}. */
  label?: ReactNode;
  /** Helper text displayed below the input when no error is set. */
  hint?: ReactNode;
  /** Error message; when present, replaces the hint and turns the border red. */
  error?: ReactNode;
  /** Leading icon, absolutely positioned inside the input on the left. */
  icon?: ReactNode;
  /** Class applied to the {@link FormField} container, not to `<input>`. */
  containerClassName?: string;
}

/**
 * Themed text input wrapped in a {@link FormField}. Supports an optional
 * leading icon and the standard label/hint/error pattern. Forwards its ref to
 * the underlying `<input>`.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, className, containerClassName, id, ...props },
  ref,
) {
  return (
    <FormField label={label} hint={hint} error={error} htmlFor={id} className={containerClassName}>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 inline-flex items-center text-[var(--text-muted)]">
            {icon}
          </span>
        ) : null}

        <input
          id={id}
          ref={ref}
          className={clsx(
            'ui-form-control w-full rounded-md border bg-[var(--bg-soft)] px-2.5 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)]',
            'focus:border-[var(--primary)] focus:outline-none focus-visible:outline-none focus-visible:ring-0',
            icon && 'pl-10',
            error ? 'border-[var(--danger)]' : 'border-[var(--line)]',
            className,
          )}
          {...props}
        />
      </div>
    </FormField>
  );
});
