import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react';
import clsx from 'clsx';
import { FormField } from './FormField';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options: SelectOption[];
  containerClassName?: string;
}

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
