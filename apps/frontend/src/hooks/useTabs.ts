import { useCallback, useMemo, useState } from 'react';
import type { AgentRunKind } from '@nakiros/shared';

/*
 * Multi-tab shell state — Phase 1 PR2a of the new-design integration
 * (`docs/refactoring/07-new-design-integration.md`). Models the tabs the
 * user opens at the top of the new shell. Wired into the actual shell
 * component in PR2b.
 *
 * Tabs are a discriminated union because each kind carries a different
 * payload:
 * - `home`    — the Home screen (project list / catalogs)
 * - `project` — a project dashboard with a sub-view (overview, skills, ...)
 * - `run`     — a single agent run detail
 *
 * IDs are short random strings minted at open time. Dedup is by stable
 * domain keys (projectId for projects, runId for runs) so reopening a
 * project that's already in the strip just focuses the existing tab.
 *
 * The hook is purely in-memory; persistence across reloads is deferred
 * (cf. plan PR2b decision #2).
 */

/** Sub-view within a project tab. Mirrors the new-design sidebar items.
 *
 * The `.claude/` configuration is split into one tab per category (Module 1+
 * V2). Modules not yet shipped render a "Coming soon" placeholder. Skills is
 * the existing tab kept untouched for now.
 */
export type ProjectTabView =
  | 'overview'
  | 'convs'
  | 'claudeMd'
  | 'rules'
  | 'subagents'
  | 'skills'
  | 'outputStyles'
  | 'permissions'
  | 'mcp'
  | 'hooks'
  | 'recs'
  | 'settings';

interface HomeTab {
  id: string;
  kind: 'home';
  label: string;
}

interface ProjectTab {
  id: string;
  kind: 'project';
  projectId: string;
  label: string;
  view: ProjectTabView;
  /** When `view === 'skills'`, the focused skill id (null = list view). */
  skillId?: string | null;
}

interface RunTab {
  id: string;
  kind: 'run';
  runId: string;
  /** Run discriminator — drives which IPC channels the RunScreen calls. */
  runKind: AgentRunKind;
  label: string;
}

/**
 * Identity of a skill across every supported scope. Mirrors the
 * `SkillScope` discriminator used by the daemon's skill-related
 * IPC channels, with the extra fields the underlying lookup needs
 * (projectId / pluginName / marketplaceName).
 */
export type SkillTabIdentity =
  | { scope: 'project'; projectId: string; skillName: string }
  | { scope: 'claude-global'; skillName: string }
  | { scope: 'plugin'; marketplaceName: string; pluginName: string; skillName: string }
  | { scope: 'nakiros-bundled'; skillName: string };

interface SkillTab {
  id: string;
  kind: 'skill';
  /** Discriminated identity used to look the skill up + read its files. */
  identity: SkillTabIdentity;
  label: string;
}

/** Sub-view within a marketplace tab — kept in sync with what
 *  `MarketplaceScreen` renders. */
export type MarketplaceTabView = 'overview' | 'skills';

interface MarketplaceTab {
  id: string;
  kind: 'marketplace';
  /** Marketplace folder name (matches `Skill.marketplaceName`). */
  marketplaceName: string;
  label: string;
  view: MarketplaceTabView;
}

/** Global settings tab — singleton, not tied to any project. */
interface SettingsTab {
  id: string;
  kind: 'settings';
  label: string;
}

export type Tab = HomeTab | ProjectTab | RunTab | SkillTab | MarketplaceTab | SettingsTab;

/** Args accepted by {@link UseTabsApi.openTab}. The id is generated. */
export type OpenTabInput =
  | Omit<HomeTab, 'id'>
  | Omit<ProjectTab, 'id'>
  | Omit<RunTab, 'id'>
  | Omit<SkillTab, 'id'>
  | Omit<MarketplaceTab, 'id'>
  | Omit<SettingsTab, 'id'>;

interface UseTabsApi {
  tabs: Tab[];
  activeTabId: string;
  activeTab: Tab;
  /**
   * Opens a tab and focuses it. Dedupes:
   * - `project` tabs by `projectId`
   * - `run` tabs by `runId`
   * `home` tabs are always added (a user can want multiple Home tabs).
   * Returns the id of the focused tab (existing or newly minted).
   */
  openTab(input: OpenTabInput): string;
  /**
   * Closes a tab. If the closed tab was active, focus moves to its
   * left neighbor (or right if it was the first). If the last tab is
   * closed, a fresh Home tab is inserted to keep the shell renderable.
   */
  closeTab(id: string): void;
  /** Focus the given tab. No-op if the id is unknown. */
  setActiveTab(id: string): void;
  /**
   * Patch a tab in place. Useful for navigating sub-views inside a
   * project tab without opening a new one. The patch is type-narrowed
   * by the existing tab kind: passing fields that don't apply is a no-op.
   */
  updateTab(id: string, patch: Partial<Tab>): void;
}

function newId(): string {
  return 't' + Math.random().toString(36).slice(2, 7);
}

/**
 * Two skill tabs are considered "the same" when they point at the
 * same skill in the same scope (and same plugin/project/marketplace
 * keys). Used by `useTabs.openTab` to dedupe.
 */
function sameSkillIdentity(a: SkillTabIdentity, b: SkillTabIdentity): boolean {
  if (a.scope !== b.scope) return false;
  if (a.skillName !== b.skillName) return false;
  if (a.scope === 'project' && b.scope === 'project') return a.projectId === b.projectId;
  if (a.scope === 'plugin' && b.scope === 'plugin') {
    return a.marketplaceName === b.marketplaceName && a.pluginName === b.pluginName;
  }
  return true;
}

function makeHomeTab(): Tab {
  return { id: newId(), kind: 'home', label: 'Home' };
}

/**
 * React hook owning the tab strip state for the new shell. See module
 * doc-comment for the model and dedup behavior.
 */
export function useTabs(initial?: Tab[]): UseTabsApi {
  const [tabs, setTabs] = useState<Tab[]>(() => {
    if (initial && initial.length > 0) return initial;
    return [makeHomeTab()];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => (initial?.[0]?.id ?? tabs[0]!.id));

  const openTab = useCallback((input: OpenTabInput): string => {
    let focusedId = '';
    setTabs((prev) => {
      // Dedup by domain key for project/run tabs.
      if (input.kind === 'project') {
        const existing = prev.find(
          (t): t is ProjectTab => t.kind === 'project' && t.projectId === input.projectId,
        );
        if (existing) {
          focusedId = existing.id;
          return prev;
        }
      } else if (input.kind === 'run') {
        const existing = prev.find(
          (t): t is RunTab => t.kind === 'run' && t.runId === input.runId,
        );
        if (existing) {
          focusedId = existing.id;
          return prev;
        }
      } else if (input.kind === 'skill') {
        const existing = prev.find(
          (t): t is SkillTab => t.kind === 'skill' && sameSkillIdentity(t.identity, input.identity),
        );
        if (existing) {
          focusedId = existing.id;
          return prev;
        }
      } else if (input.kind === 'marketplace') {
        const existing = prev.find(
          (t): t is MarketplaceTab =>
            t.kind === 'marketplace' && t.marketplaceName === input.marketplaceName,
        );
        if (existing) {
          focusedId = existing.id;
          return prev;
        }
      } else if (input.kind === 'settings') {
        // Settings is a singleton — reuse any existing settings tab.
        const existing = prev.find((t): t is SettingsTab => t.kind === 'settings');
        if (existing) {
          focusedId = existing.id;
          return prev;
        }
      }
      const id = newId();
      focusedId = id;
      return [...prev, { ...input, id } as Tab];
    });
    if (focusedId) setActiveTabId(focusedId);
    return focusedId;
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;

      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fresh = makeHomeTab();
        setActiveTabId(fresh.id);
        return [fresh];
      }

      // Refocus only if the closed tab was the active one.
      setActiveTabId((current) => {
        if (current !== id) return current;
        const neighbor = next[Math.max(0, idx - 1)] ?? next[0]!;
        return neighbor.id;
      });
      return next;
    });
  }, []);

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId((current) => {
      // Avoid spurious renders when re-clicking the active tab.
      if (current === id) return current;
      return id;
    });
  }, []);

  const updateTab = useCallback((id: string, patch: Partial<Tab>) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        // The cast is safe: callers pass partials that match the tab kind;
        // unknown fields are a no-op at runtime and a discriminated-union
        // narrowing problem at compile-time we accept here.
        return { ...t, ...patch } as Tab;
      }),
    );
  }, []);

  const activeTab = useMemo<Tab>(() => {
    return tabs.find((t) => t.id === activeTabId) ?? tabs[0]!;
  }, [tabs, activeTabId]);

  return {
    tabs,
    activeTabId: activeTab.id,
    activeTab,
    openTab,
    closeTab,
    setActiveTab,
    updateTab,
  };
}
