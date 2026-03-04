import { BookOpen, Kanban, LayoutDashboard, MessageSquare, Settings2 } from 'lucide-react';

export type SidebarTab = 'overview' | 'chat' | 'product' | 'delivery' | 'settings';

interface Props {
  active: SidebarTab;
  onChange(tab: SidebarTab): void;
  labels: Record<SidebarTab, string>;
}

const navTabs: { id: Exclude<SidebarTab, 'settings'>; icon: React.ReactNode }[] = [
  { id: 'overview', icon: <LayoutDashboard size={18} /> },
  { id: 'chat', icon: <MessageSquare size={18} /> },
  { id: 'product', icon: <BookOpen size={18} /> },
  { id: 'delivery', icon: <Kanban size={18} /> },
];

export default function Sidebar({ active, onChange, labels }: Props) {
  return (
    <div
      style={{
        width: 68,
        background: 'var(--bg-soft)',
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 10,
        flexShrink: 0,
      }}
    >
      {/* Nav tabs */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
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

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Settings at bottom */}
      <div style={{ borderTop: '1px solid var(--line)', width: '100%', display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
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
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick(): void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: 60,
        height: 54,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        background: active ? 'var(--bg-muted)' : 'transparent',
        border: active ? '1px solid var(--primary)' : '1px solid transparent',
        borderRadius: 10,
        cursor: 'pointer',
        color: active ? 'var(--primary)' : 'var(--text-muted)',
        padding: '0 2px',
      }}
    >
      {icon}
      <span style={{ fontSize: 9, color: active ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.03em' }}>
        {label}
      </span>
    </button>
  );
}
