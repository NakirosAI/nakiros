import { type ReactNode } from 'react';
import clsx from 'clsx';

interface TabButtonProps {
  active: boolean;
  onClick(): void;
  disabled?: boolean;
  children: ReactNode;
}

/**
 * Segmented-control tab button with filled active state — used for in-page
 * tab groups where the active tab gets a `bg-[var(--bg-muted)]` fill rather
 * than an underline. For top-level page navigation prefer the Radix-based
 * {@link Tabs} family in `tabs.tsx`.
 */
export function TabButton({ active, onClick, disabled, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
        active
          ? 'bg-[var(--bg-muted)] text-[var(--text-primary)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
      )}
    >
      {children}
    </button>
  );
}
