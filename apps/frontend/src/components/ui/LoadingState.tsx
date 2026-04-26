import { type ReactNode } from 'react';
import clsx from 'clsx';

/** Text-size variant for the message — matches the dominant inline-text scales used across the views. */
export type LoadingStateSize = 'xs' | 'sm' | 'md';

interface LoadingStateProps {
  /** Message or composition (text + spinner) shown centered. */
  children?: ReactNode;
  /** Default `'md'` — uses the parent's font size. `'xs'`/`'sm'` shrink the message for dense panels. */
  size?: LoadingStateSize;
  /** Extra classes appended to the root — useful for padding (`px-4`), gap, or color override. */
  className?: string;
}

/**
 * Centered muted-text placeholder shown while a panel/list is loading or
 * temporarily empty. Replaces the repeated inline pattern
 * `flex flex-1 items-center justify-center text-[var(--text-muted)]` used in
 * 15+ views. For full empty states (with title + action), use `EmptyState`.
 */
export function LoadingState({ children, size = 'md', className }: LoadingStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-1 items-center justify-center text-[var(--text-muted)]',
        size === 'xs' && 'text-xs',
        size === 'sm' && 'text-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}
