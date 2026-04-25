import { type ReactNode } from 'react';
import { LayoutDashboard, MessageSquare, Settings, Sparkles, Lightbulb } from 'lucide-react';
import clsx from 'clsx';

/**
 * Identifier of one of the top-level navigation tabs in the project shell.
 * Drives both the `Sidebar` UI and the `DashboardRouter` view switch.
 */
export type SidebarTab = 'dashboard' | 'skills' | 'conversations' | 'recommendations' | 'settings';

interface Props {
  /** Currently active tab — controlled by the parent shell. */
  active: SidebarTab;
  /** Called when the user clicks a different tab. */
  onChange(tab: SidebarTab): void;
  /** i18n labels keyed by tab id (rendered under each icon and as title). */
  labels: Record<SidebarTab, string>;
}

const navTabs: { id: Exclude<SidebarTab, 'settings'>; icon: ReactNode }[] = [
  { id: 'dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'skills', icon: <Sparkles size={18} /> },
  { id: 'conversations', icon: <MessageSquare size={18} /> },
  { id: 'recommendations', icon: <Lightbulb size={18} /> },
];

/**
 * Vertical icon-only navigation rail rendered on the left of the dashboard.
 * Pure presentational component: state lives in the parent shell which
 * passes the active tab and an onChange handler.
 */
export default function Sidebar({ active, onChange, labels }: Props) {
  return (
    <div className="flex w-[68px] shrink-0 flex-col items-center border-r border-[var(--line)] bg-[var(--bg-soft)] py-2.5">
      <div className="flex flex-col items-center gap-0.5">
        {navTabs.map((tab) => (
          <SidebarButton
            key={tab.id}
            icon={tab.icon}
            label={labels[tab.id]}
            active={active === tab.id}
            onClick={() => onChange(tab.id)}
          />
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex w-full justify-center border-t border-[var(--line)] pt-2">
        <SidebarButton
          icon={<Settings size={18} />}
          label={labels.settings}
          active={active === 'settings'}
          onClick={() => onChange('settings')}
        />
      </div>
    </div>
  );
}

function SidebarButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick(): void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={clsx(
        'relative flex h-[54px] w-[60px] flex-col items-center justify-center gap-1 rounded-[10px] border px-0.5',
        active
          ? 'border-[var(--primary)] bg-[var(--bg-muted)] text-[var(--primary)]'
          : 'border-transparent bg-transparent text-[var(--text-muted)]',
      )}
    >
      {icon}
      <span
        className={clsx(
          'text-[9px] font-bold tracking-[0.03em]',
          active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]',
        )}
      >
        {label}
      </span>
    </button>
  );
}
