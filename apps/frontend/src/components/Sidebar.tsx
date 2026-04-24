import { type ReactNode } from 'react';
import { LayoutDashboard, MessageSquare, Settings, Sparkles, Lightbulb } from 'lucide-react';
import clsx from 'clsx';

export type SidebarTab = 'dashboard' | 'skills' | 'conversations' | 'recommendations' | 'settings';

interface Props {
  active: SidebarTab;
  onChange(tab: SidebarTab): void;
  labels: Record<SidebarTab, string>;
  /** Optional per-tab badge count — renders a small pill when > 0. */
  badges?: Partial<Record<SidebarTab, number>>;
}

const navTabs: { id: Exclude<SidebarTab, 'settings'>; icon: ReactNode }[] = [
  { id: 'dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'skills', icon: <Sparkles size={18} /> },
  { id: 'conversations', icon: <MessageSquare size={18} /> },
  { id: 'recommendations', icon: <Lightbulb size={18} /> },
];

export default function Sidebar({ active, onChange, labels, badges }: Props) {
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
            badgeCount={badges?.[tab.id]}
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
          badgeCount={badges?.settings}
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
  badgeCount,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick(): void;
  badgeCount?: number;
}) {
  const showBadge = typeof badgeCount === 'number' && badgeCount > 0;
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
      {showBadge && (
        <span
          className="absolute right-1 top-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-[var(--primary)] px-[3px] text-[9px] font-bold text-white"
          aria-label={`${badgeCount}`}
        >
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
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
