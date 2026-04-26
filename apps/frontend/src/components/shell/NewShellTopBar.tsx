import { Home as HomeIcon, Folder, Activity, X, Plus } from 'lucide-react';
import type { AgentRun, Project } from '@nakiros/shared';
import type { Tab } from '../../hooks/useTabs';
import RunDock from './RunDock';

interface NewShellTopBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab(id: string): void;
  onCloseTab(id: string): void;
  onNewTab(): void;
  /** Called when a run is activated from the RunDock dropdown. */
  onOpenRun(run: AgentRun): void;
  /** Forwarded to {@link RunDock} so it can render run target labels. */
  projects: Project[];
}

/**
 * TopBar of the new-design shell. Renders the open tab strip with a
 * per-tab close button and a "new tab" affordance. RunDock and version
 * badge are out of scope for PR2b — they ship in PR2c.
 *
 * Iconography is pulled from Lucide (already used everywhere in the
 * app); the new-design mockup's custom SVG glyphs are not adopted.
 */
export default function NewShellTopBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onOpenRun,
  projects,
}: NewShellTopBarProps) {
  return (
    <header className="flex h-10 flex-shrink-0 items-stretch border-b border-n-border-subtle bg-n-canvas pr-2.5 font-n-sans">
      <div className="flex flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab) => (
          <TabPill
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            onClick={() => onSelectTab(tab.id)}
            onClose={() => onCloseTab(tab.id)}
          />
        ))}
        <button
          type="button"
          onClick={onNewTab}
          aria-label="New tab"
          className="px-3 text-n-subtle hover:text-n-fg"
        >
          <Plus size={15} strokeWidth={2} />
        </button>
      </div>
      <div className="flex items-center gap-2.5 pl-2">
        <RunDock onOpenRun={onOpenRun} projects={projects} />
      </div>
    </header>
  );
}

function tabIcon(tab: Tab) {
  if (tab.kind === 'home') return HomeIcon;
  if (tab.kind === 'run') return Activity;
  return Folder;
}

interface TabPillProps {
  tab: Tab;
  active: boolean;
  onClick(): void;
  onClose(): void;
}

function TabPill({ tab, active, onClick, onClose }: TabPillProps) {
  const Icon = tabIcon(tab);
  return (
    <div
      onClick={onClick}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
      className={
        'group relative inline-flex min-w-[120px] max-w-[220px] cursor-pointer items-center gap-2 border-r border-n-border-subtle px-3 text-[12.5px] ' +
        (active
          ? 'bg-n-surface text-n-fg'
          : 'text-n-muted hover:bg-n-surface/40 hover:text-n-fg')
      }
    >
      {active && <span className="absolute inset-x-0 top-0 h-px bg-n-accent" />}
      <Icon
        size={13}
        className={active ? 'text-n-accent' : 'text-n-subtle'}
        strokeWidth={2}
      />
      <span className="flex-1 truncate">{tab.label}</span>
      <button
        type="button"
        aria-label="Close tab"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={
          'inline-flex h-4 w-4 items-center justify-center rounded text-n-subtle hover:bg-n-raised hover:text-n-fg ' +
          (active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
        }
      >
        <X size={11} strokeWidth={2.5} />
      </button>
    </div>
  );
}
