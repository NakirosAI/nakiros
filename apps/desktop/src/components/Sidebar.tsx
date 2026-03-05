import { type ReactNode } from 'react';
import { BookOpen, Kanban, LayoutDashboard, MessageSquare, Settings2 } from 'lucide-react';
import clsx from 'clsx';

export type SidebarTab = 'overview' | 'chat' | 'product' | 'delivery' | 'settings';

interface Props {
  active: SidebarTab;
  onChange(tab: SidebarTab): void;
  labels: Record<SidebarTab, string>;
  chatHasCompletionNotice?: boolean;
}

const navTabs: { id: Exclude<SidebarTab, 'settings'>; icon: ReactNode }[] = [
  { id: 'overview', icon: <LayoutDashboard size={18} /> },
  { id: 'chat', icon: <MessageSquare size={18} /> },
  { id: 'product', icon: <BookOpen size={18} /> },
  { id: 'delivery', icon: <Kanban size={18} /> },
];

export default function Sidebar({ active, onChange, labels, chatHasCompletionNotice = false }: Props) {
  return (
    <div className="flex w-[68px] shrink-0 flex-col items-center border-r border-[var(--line)] bg-[var(--bg-soft)] py-2.5">
      <div className="flex flex-col items-center gap-0.5">
        {navTabs.map((tab) => (
          <SidebarButton
            key={tab.id}
            icon={tab.icon}
            label={labels[tab.id]}
            active={active === tab.id}
            showCompletionNotice={tab.id === 'chat' && chatHasCompletionNotice}
            onClick={() => onChange(tab.id)}
          />
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex w-full justify-center border-t border-[var(--line)] pt-2">
        <SidebarButton
          icon={<Settings2 size={18} />}
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
  showCompletionNotice,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  showCompletionNotice?: boolean;
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
      {showCompletionNotice && (
        <span className="absolute right-[11px] top-[11px] h-2 w-2 rounded-full bg-[#14b8a6]" />
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
