import { type ReactNode, type ComponentProps } from 'react';
import { Button } from './Button';

type ButtonVariant = ComponentProps<typeof Button>['variant'];

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: EmptyStateAction;
  className?: string;
}

export function EmptyState({ icon, title, subtitle, action, className }: EmptyStateProps) {
  return (
    <div
      className={[
        'flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--bg-soft)] px-6 text-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon ? (
        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--bg-card)] text-[var(--text-muted)]">
          {icon}
        </div>
      ) : null}

      <h3 className="m-0 text-base font-semibold text-[var(--text)]">{title}</h3>

      {subtitle ? <p className="mt-1 max-w-md text-sm text-[var(--text-muted)]">{subtitle}</p> : null}

      {action ? (
        <div className="mt-5">
          <Button variant={action.variant ?? 'secondary'} onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
