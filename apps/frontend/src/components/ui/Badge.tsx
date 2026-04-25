import { type HTMLAttributes } from 'react';
import clsx from 'clsx';

/**
 * Visual tone for a {@link Badge}, mapped to CSS variables in the Nakiros theme.
 */
export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Visual tone of the badge. Defaults to `'muted'`. */
  variant?: BadgeVariant;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: 'border-[var(--success)] bg-[var(--bg-soft)] text-[var(--success)]',
  warning: 'border-[var(--warning)] bg-[var(--bg-soft)] text-[var(--warning)]',
  danger: 'border-[var(--danger)] bg-[var(--bg-soft)] text-[var(--danger)]',
  info: 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]',
  muted: 'border-[var(--line-strong)] bg-[var(--bg-soft)] text-[var(--text-muted)]',
};

/**
 * Inline pill used to label statuses, counts, or short tags. Renders a `<span>`
 * with a tone-coloured border + soft background driven by the global theme
 * tokens (no external UI library — pure Tailwind + CSS variables).
 */
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
