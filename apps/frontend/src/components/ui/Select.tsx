import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react';
import clsx from 'clsx';
import { FormField } from './FormField';

/** Single entry in a {@link Select} dropdown. */
export interface SelectOption {
  /** Submitted value. */
  value: string;
  /** User-facing label. */
  label: string;
  /** When true, the option cannot be selected. */
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  /** Optional label rendered by the wrapping {@link FormField}. */
  label?: ReactNode;
  /** Helper text displayed below the select when no error is set. */
  hint?: ReactNode;
  /** Error message; replaces the hint and turns the border red. */
  error?: ReactNode;
  /** Available options rendered as native `<option>` elements. */
  options: SelectOption[];
  /** Class applied to the {@link FormField} container. */
  containerClassName?: string;
}

/**
 * Themed native `<select>` wrapped in a {@link FormField} with a custom caret.
 * Driven by an `options` array rather than `children` so consumers don't have
 * to deal with `<option>` JSX. Forwards its ref to the underlying `<select>`.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, className, containerClassName, id, ...props },
  ref,
) {
  return (
    <FormField label={label} hint={hint} error={error} htmlFor={id} className={containerClassName}>
      <div className="relative">
        <select
          id={id}
          ref={ref}
          className={clsx(
            'ui-form-control w-full appearance-none rounded-md border bg-[var(--bg-soft)] px-2.5 py-2 pr-9 text-xs text-[var(--text)]',
            'focus:border-[var(--primary)] focus:outline-none focus-visible:outline-none focus-visible:ring-0',
            error ? 'border-[var(--danger)]' : 'border-[var(--line)]',
            className,
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        <span className="pointer-events-none absolute inset-y-0 right-3 inline-flex items-center text-[var(--text-muted)]">
          ▾
        </span>
      </div>
    </FormField>
  );
});
