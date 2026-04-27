import { useState, type ReactNode } from 'react';
import { Home, Sparkles, MessageSquare, Lightbulb } from 'lucide-react';
import nakirosLogo from '../../assets/icon.svg';
import type { ProjectTabView } from '../../hooks/useTabs';

interface SidebarItem {
  id: ProjectTabView;
  label: string;
  icon: ReactNode;
  /** When true, the item is rendered greyed-out + non-interactive. */
  disabled: boolean;
  /** Tooltip suffix shown after the label (e.g. "Phase 3"). */
  comingIn?: string;
}

interface NewShellSidebarProps {
  active: ProjectTabView;
  onNavigate(view: ProjectTabView): void;
}

/**
 * Vertical icon rail of the new-design shell — port of the `Sidebar`
 * component in `apps/Nakiros-new-design/shell.jsx`. Renders 4 entries
 * for project tabs (Overview / Skills / Conversations / Recommendations).
 *
 * Only `overview` is wired in PR3b; the three others are visible but
 * disabled with a tooltip pointing at the upcoming phase. They become
 * active when their respective screen ships (Phases 3 → 5 of the
 * migration plan in `docs/refactoring/07-new-design-integration.md`).
 *
 * Tooltips appear on hover; a delayed mount avoids flicker on rapid
 * mouse traversals.
 */
export default function NewShellSidebar({ active, onNavigate }: NewShellSidebarProps) {
  const items: SidebarItem[] = [
    { id: 'overview', label: 'Overview', icon: <Home size={18} strokeWidth={2} />, disabled: false },
    { id: 'skills', label: 'Skills', icon: <Sparkles size={18} strokeWidth={2} />, disabled: false },
    { id: 'convs', label: 'Conversations', icon: <MessageSquare size={18} strokeWidth={2} />, disabled: false },
    { id: 'recs', label: 'Recommendations', icon: <Lightbulb size={18} strokeWidth={2} />, disabled: true, comingIn: 'Phase 5' },
  ];

  return (
    <aside className="flex w-14 flex-shrink-0 flex-col items-center border-r border-n-border-subtle bg-n-sunken pt-3.5 pb-3">
      <div className="mb-[18px]">
        <img src={nakirosLogo} alt="Nakiros" width={22} height={22} />
      </div>
      <nav className="flex flex-1 flex-col items-center gap-1">
        {items.map((item) => (
          <SidebarBtn
            key={item.id}
            item={item}
            active={!item.disabled && active === item.id}
            onClick={() => !item.disabled && onNavigate(item.id)}
          />
        ))}
      </nav>
    </aside>
  );
}

function SidebarBtn({
  item,
  active,
  onClick,
}: {
  item: SidebarItem;
  active: boolean;
  onClick(): void;
}) {
  const [hover, setHover] = useState(false);
  const tooltip = item.comingIn ? `${item.label} · ${item.comingIn}` : item.label;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={item.disabled}
        aria-label={tooltip}
        aria-current={active ? 'page' : undefined}
        className={
          'flex h-10 w-10 items-center justify-center rounded-n-md border transition-colors ' +
          (item.disabled
            ? 'cursor-not-allowed border-transparent text-n-faint opacity-60'
            : active
              ? 'border-n-accent-line bg-n-accent-soft text-n-accent-strong'
              : 'border-transparent text-n-subtle hover:bg-n-raised hover:text-n-fg')
        }
      >
        {item.icon}
      </button>
      {hover && (
        <div className="pointer-events-none absolute left-12 top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-n-sm border border-n-border-default bg-n-raised px-2.5 py-1.5 text-[12px] text-n-fg shadow-n-pop">
          {tooltip}
        </div>
      )}
    </div>
  );
}
