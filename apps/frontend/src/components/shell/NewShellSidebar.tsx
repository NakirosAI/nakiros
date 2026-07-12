import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  FileText,
  Home,
  Layers,
  Lightbulb,
  MessageSquare,
  Plug,
  Rocket,
  Settings as SettingsIcon,
  ShieldCheck,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react';
import nakirosLogo from '../../assets/icon.svg';
import type { ProjectTabView } from '../../hooks/useTabs';
import { useProject } from '../../hooks/useProject';
import type { ProviderType } from '@nakiros/shared';

interface SidebarItem {
  id: ProjectTabView;
  label: string;
  icon: ReactNode;
  /** When true, the item is rendered greyed-out + non-interactive. */
  disabled: boolean;
  /** Tooltip suffix shown after the label (e.g. "Module 2"). */
  comingIn?: string;
  /**
   * Allowlist of providers on which this item is visible.
   * Omitting the field means the item is visible for all providers.
   */
  providers?: ProviderType[];
}

interface SidebarSection {
  items: SidebarItem[];
}

interface NewShellSidebarProps {
  active: ProjectTabView;
  onNavigate(view: ProjectTabView): void;
}

/**
 * Vertical icon rail of the new-design shell.
 *
 * Three logical sections separated by thin dividers:
 * - **Project domain**: Overview, Conversations
 * - **`.claude/` configuration**: CLAUDE.md, Rules, Subagents, Skills,
 *   Output styles, MCP, Hooks. One tab per category. Modules not yet
 *   shipped are disabled with a tooltip pointing at the target module.
 * - **Nakiros**: Recommendations (placeholder), Settings (bottom).
 *
 * Tooltips appear on hover with a slight delay to avoid flicker.
 */
/** Providers that support the full .claude/ config surface. */
const CLAUDE_ONLY_PROVIDERS: ProviderType[] = ['claude'];

export default function NewShellSidebar({ active, onNavigate }: NewShellSidebarProps) {
  const { project } = useProject();
  const provider = project.provider;
  // Only the "Bootstrap" item is translated here — the rest of this file
  // predates the i18n rule for this screen and is left untouched to avoid
  // an unrelated refactor of every existing label in the same change.
  const { t } = useTranslation('bootstrap');

  const allSections: SidebarSection[] = [
    {
      items: [
        { id: 'overview', label: 'Overview', icon: <Home size={18} strokeWidth={2} />, disabled: false },
        { id: 'convs', label: 'Conversations', icon: <MessageSquare size={18} strokeWidth={2} />, disabled: false },
        {
          id: 'bootstrap',
          label: t('sidebar.label', { defaultValue: 'Bootstrap' }),
          icon: <Rocket size={18} strokeWidth={2} />,
          disabled: false,
        },
      ],
    },
    {
      items: [
        { id: 'claudeMd', label: 'CLAUDE.md', icon: <FileText size={18} strokeWidth={2} />, disabled: false },
        { id: 'rules', label: 'Rules', icon: <Layers size={18} strokeWidth={2} />, disabled: false, providers: CLAUDE_ONLY_PROVIDERS },
        { id: 'subagents', label: 'Subagents', icon: <Bot size={18} strokeWidth={2} />, disabled: false },
        { id: 'skills', label: 'Skills', icon: <Sparkles size={18} strokeWidth={2} />, disabled: false },
        { id: 'outputStyles', label: 'Output styles', icon: <Sliders size={18} strokeWidth={2} />, disabled: false, providers: CLAUDE_ONLY_PROVIDERS },
        { id: 'permissions', label: 'Permissions', icon: <ShieldCheck size={18} strokeWidth={2} />, disabled: false },
        { id: 'mcp', label: 'MCP', icon: <Plug size={18} strokeWidth={2} />, disabled: false, providers: CLAUDE_ONLY_PROVIDERS },
        { id: 'hooks', label: 'Hooks', icon: <Zap size={18} strokeWidth={2} />, disabled: false, providers: CLAUDE_ONLY_PROVIDERS },
      ],
    },
    {
      items: [
        { id: 'recs', label: 'Recommendations', icon: <Lightbulb size={18} strokeWidth={2} />, disabled: false },
      ],
    },
  ];

  // Filter items by provider: if `providers` is set, the item is only shown for listed providers.
  const sections: SidebarSection[] = allSections.map((section) => ({
    items: section.items.filter((item) => !item.providers || item.providers.includes(provider)),
  }));

  const settingsItem: SidebarItem = {
    id: 'settings',
    label: 'Settings',
    icon: <SettingsIcon size={18} strokeWidth={2} />,
    disabled: false,
  };

  return (
    <aside className="flex w-14 flex-shrink-0 flex-col items-center border-r border-n-border-subtle bg-n-sunken pt-3.5 pb-3">
      <div className="mb-[18px]">
        <img src={nakirosLogo} alt="Nakiros" width={22} height={22} />
      </div>
      <nav className="flex flex-1 flex-col items-center gap-1">
        {sections.map((section, idx) => (
          <div key={idx} className="flex flex-col items-center gap-1">
            {idx > 0 && <div className="my-1.5 h-px w-6 bg-n-border-subtle" />}
            {section.items.map((item) => (
              <SidebarBtn
                key={item.id}
                item={item}
                active={!item.disabled && active === item.id}
                onClick={() => !item.disabled && onNavigate(item.id)}
              />
            ))}
          </div>
        ))}
      </nav>
      <SidebarBtn
        item={settingsItem}
        active={active === 'settings'}
        onClick={() => onNavigate('settings')}
      />
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
