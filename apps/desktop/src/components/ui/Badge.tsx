import { type HTMLAttributes } from 'react';
import clsx from 'clsx';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: 'border-[var(--success)] bg-[var(--bg-soft)] text-[var(--success)]',
  warning: 'border-[var(--warning)] bg-[var(--bg-soft)] text-[var(--warning)]',
  danger: 'border-[var(--danger)] bg-[var(--bg-soft)] text-[var(--danger)]',
  info: 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]',
  muted: 'border-[var(--line-strong)] bg-[var(--bg-soft)] text-[var(--text-muted)]',
};

export function Badge({ variant = 'muted', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
