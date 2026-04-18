import { type ReactNode } from 'react';
import clsx from 'clsx';

interface FormFieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function FormField({
  label,
  hint,
  error,
  htmlFor,
  required = false,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
        >
          {label}
          {required ? <span className="ml-1 text-[var(--danger)]">*</span> : null}
        </label>
      )}

      {children}

      {error ? (
        <p className="text-xs text-[var(--danger)]">{error}</p>
      ) : (
        hint ? <p className="text-xs text-[var(--text-muted)]">{hint}</p> : null
      )}
    </div>
  );
}
