import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  Folder,
  Globe,
  Layers,
  Plug,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import type { ProjectAggregate, Project, ScanProgress, Skill } from '@nakiros/shared';
import type { SkillTabIdentity } from '../hooks/useTabs';
import appIcon from '../assets/icon.svg';

interface HomeScreenProps {
  /** Projects loaded by App.tsx at boot — cheap pre-render data. */
  projects: Project[];
  /** Boot error to surface above the project grid (optional). */
  bootError?: string;
  /** Activated when the user clicks a project card. */
  onOpenProject(projectId: string): void;
  /** Triggered by the "Rescan" hero action — must rescan & refresh the
   *  project list it received via {@link projects}. Resolves once the scan
   *  finishes; the home tracks its own banner state in the meantime. */
  onRescan(): Promise<void> | void;
  /** Triggered by per-project dismiss action — currently unused but kept
   *  for parity with the legacy `Home` API. */
  onDismissProject(projectId: string): Promise<void>;
  /** Called after the user restores a previously-dismissed project so the
   *  parent can refresh its `projects` state. Defaults to a no-op when omitted
   *  (the dismissed panel still works locally but new cards won't appear in
   *  the active grid until the next mount). */
  onProjectsChanged?(): Promise<void> | void;
  /** Opens a non-project skill in a dedicated `kind: 'skill'` tab. */
  onOpenSkillTab(identity: SkillTabIdentity, label: string): void;
  /** Opens a marketplace in a dedicated `kind: 'marketplace'` tab. */
  onOpenMarketplaceTab(marketplaceName: string, label: string): void;
  /** Opens the global settings tab (singleton — deduped by useTabs). */
  onOpenSettings(): void;
}

type HomeTabKey = 'projects' | 'cowork' | 'plugins' | 'globals' | 'nakiros';

/**
 * New-design Home screen — port of `screens-home.jsx` from the
 * Nakiros mockup. Renders three tabs (Projects / Plugins / Globals)
 * sharing a hero header, a search bar with `⌘K` hint, and the legacy
 * `onRescan` shortcut.
 *
 * Data is fully real: projects come from `listProjects` (already
 * loaded by App.tsx), plugin skills via `listPluginSkills`, and
 * global skills via `listClaudeGlobalSkills`. Per-project health and
 * score are derived from `listProjectConversationsWithAnalysis`,
 * fetched in parallel for every project on mount.
 *
 * Out of scope (notes in code):
 * - "Nakiros Skills" hero button — disabled until the bundled
 *   skills catalog is folded into this screen.
 * - Plugin / global skill score badges — `Skill.evals?.latestPassRate`
 *   is exposed when present, which already covers most cases.
 */
export default function HomeScreen({
  projects,
  bootError,
  onOpenProject,
  onRescan,
  onOpenSkillTab,
  onOpenMarketplaceTab,
  onProjectsChanged,
  onOpenSettings,
}: HomeScreenProps) {
  const { t } = useTranslation('home');
  const [tab, setTab] = useState<HomeTabKey>('projects');
  const [search, setSearch] = useState('');

  const [rescanning, setRescanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);

  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissedProjects, setDismissedProjects] = useState<Project[] | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const [pluginSkills, setPluginSkills] = useState<Skill[] | null>(null);
  const [pluginsError, setPluginsError] = useState<string | null>(null);
  const [globalSkills, setGlobalSkills] = useState<Skill[] | null>(null);
  const [globalsError, setGlobalsError] = useState<string | null>(null);
  const [bundledSkills, setBundledSkills] = useState<Skill[] | null>(null);
  const [bundledError, setBundledError] = useState<string | null>(null);

  const claudeProjects = useMemo(
    () => projects.filter((p) => p.provider === 'claude'),
    [projects],
  );
  const coworkProjects = useMemo(
    () => projects.filter((p) => p.provider === 'cowork'),
    [projects],
  );

  // Lazy-load the secondary tabs the first time the user opens them
  // so the projects tab paints fast on boot.
  useEffect(() => {
    if (tab !== 'plugins' || pluginSkills !== null) return;
    let cancelled = false;
    window.nakiros
      .listPluginSkills()
      .then((skills) => {
        if (cancelled) return;
        setPluginSkills(skills);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPluginsError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tab, pluginSkills]);

  useEffect(() => {
    if (tab !== 'globals' || globalSkills !== null) return;
    let cancelled = false;
    window.nakiros
      .listClaudeGlobalSkills()
      .then((skills) => {
        if (cancelled) return;
        setGlobalSkills(skills);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setGlobalsError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tab, globalSkills]);

  useEffect(() => {
    if (tab !== 'nakiros' || bundledSkills !== null) return;
    let cancelled = false;
    window.nakiros
      .listBundledSkills()
      .then((skills) => {
        if (cancelled) return;
        setBundledSkills(skills);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBundledError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tab, bundledSkills]);

  // Lazy-load the dismissed list when the user opens the panel for the first
  // time. Refetched after a rescan because the active list may change.
  useEffect(() => {
    if (!showDismissed || dismissedProjects !== null) return;
    let cancelled = false;
    window.nakiros
      .listDismissedProjects()
      .then((list) => {
        if (cancelled) return;
        setDismissedProjects(list);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDismissedError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [showDismissed, dismissedProjects]);

  // After a rescan, drop the cached dismissed list so it re-fetches when the
  // panel is opened again — `scan()` doesn't dismiss anything new on its own
  // but a user may have called `dismissProject` in between.
  useEffect(() => {
    setDismissedProjects(null);
  }, [projects]);

  async function handleRestore(id: string) {
    setRestoringId(id);
    try {
      const restored = await window.nakiros.undismissProject(id);
      if (restored) {
        setDismissedProjects((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
        if (onProjectsChanged) {
          await onProjectsChanged();
        }
      }
    } finally {
      setRestoringId(null);
    }
  }

  const tabs: Array<{ id: HomeTabKey; label: string; icon: React.ReactNode; count: number | null }> = [
    {
      id: 'projects',
      label: t('tabs.projects', { defaultValue: 'Claude Code' }),
      icon: <Folder size={13} strokeWidth={2} />,
      count: claudeProjects.length,
    },
    {
      id: 'cowork',
      label: t('tabs.cowork', { defaultValue: 'Cowork' }),
      icon: <Users size={13} strokeWidth={2} />,
      count: coworkProjects.length,
    },
    {
      id: 'plugins',
      label: t('tabs.plugins', { defaultValue: 'Plugins' }),
      icon: <Plug size={13} strokeWidth={2} />,
      count: pluginSkills === null ? null : countDistinctPlugins(pluginSkills),
    },
    {
      id: 'globals',
      label: t('tabs.globals', { defaultValue: 'Globals' }),
      icon: <Globe size={13} strokeWidth={2} />,
      count: globalSkills === null ? null : globalSkills.length,
    },
    {
      id: 'nakiros',
      label: t('tabs.nakiros', { defaultValue: 'Nakiros' }),
      icon: <Layers size={13} strokeWidth={2} />,
      count: bundledSkills === null ? null : bundledSkills.length,
    },
  ];

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto font-n-sans">
      <div className="mx-auto w-full max-w-[980px] px-8 pb-20 pt-9">
      {/* Hero */}
      <div className="mb-7 flex items-start justify-between gap-6">
        <div>
          <div className="mb-1.5 flex items-center gap-3">
            <NakirosMark />
            <h1 className="m-0 font-n-mono text-[26px] font-medium tracking-[-0.5px] text-n-fg">
              Nakiros
            </h1>
          </div>
          <p className="m-0 max-w-[480px] text-[14px] text-n-muted">
            {t('hero.tagline', {
              defaultValue:
                'Analyze, audit, and improve the skills powering your Claude Code agents — entirely on your machine.',
            })}
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={async () => {
              if (rescanning) return;
              setRescanning(true);
              setScanProgress(null);
              const unsubscribe = window.nakiros.onScanProgress((p) =>
                setScanProgress(p as ScanProgress),
              );
              try {
                await onRescan();
              } finally {
                unsubscribe();
                setRescanning(false);
                setScanProgress(null);
              }
            }}
            disabled={rescanning}
            className="inline-flex h-8 items-center gap-1.5 rounded-n-sm bg-transparent px-3 font-n-mono text-[12px] text-n-muted hover:bg-n-raised hover:text-n-fg disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={13}
              strokeWidth={2}
              className={rescanning ? 'animate-spin' : undefined}
            />
            {rescanning
              ? t('hero.rescanning', { defaultValue: 'Scanning…' })
              : t('hero.rescan', { defaultValue: 'Rescan' })}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            title={t('hero.openSettings', { defaultValue: 'Settings' })}
            className="inline-flex h-8 items-center gap-1.5 rounded-n-sm bg-transparent px-3 font-n-mono text-[12px] text-n-muted hover:bg-n-raised hover:text-n-fg"
          >
            <Settings size={13} strokeWidth={2} />
            {t('hero.openSettings', { defaultValue: 'Settings' })}
          </button>
        </div>
      </div>

      {bootError && (
        <div className="mb-4 rounded-n-md border border-n-critical bg-n-critical-soft px-3 py-2 font-n-mono text-[12px] text-n-critical">
          {bootError}
        </div>
      )}

      {rescanning && (
        <RescanBanner progress={scanProgress} />
      )}

      {/* Sub-nav + search */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-0.5 rounded-n-md border border-n-border-subtle bg-n-sunken p-0.5">
          {tabs.map((entry) => {
            const isActive = entry.id === tab;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={
                  'inline-flex items-center gap-1.5 rounded-n-xs px-2.5 py-1 font-n-mono text-[11.5px] transition-colors ' +
                  (isActive
                    ? 'bg-n-raised text-n-fg'
                    : 'bg-transparent text-n-muted hover:text-n-fg')
                }
              >
                <span className={isActive ? 'text-n-accent' : 'text-n-subtle'}>{entry.icon}</span>
                {entry.label}
                {entry.count !== null && (
                  <span className="font-n-mono tabular-nums text-[10px] text-n-faint">
                    {entry.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <SearchInput value={search} onChange={setSearch} />
      </div>

      {/* Body */}
      {tab === 'projects' && (
        <>
          <ProjectsTab projects={claudeProjects} kind="claude" search={search} onOpen={onOpenProject} />
          <DismissedToggle
            open={showDismissed}
            count={dismissedProjects?.length ?? null}
            onToggle={() => setShowDismissed((v) => !v)}
          />
          {showDismissed && (
            <DismissedSection
              projects={dismissedProjects}
              error={dismissedError}
              search={search}
              restoringId={restoringId}
              onRestore={handleRestore}
            />
          )}
        </>
      )}
      {tab === 'cowork' && (
        <ProjectsTab projects={coworkProjects} kind="cowork" search={search} onOpen={onOpenProject} />
      )}
      {tab === 'plugins' && (
        <PluginsTab
          skills={pluginSkills}
          error={pluginsError}
          search={search}
          onOpenMarketplaceTab={onOpenMarketplaceTab}
        />
      )}
      {tab === 'globals' && (
        <GlobalsTab
          skills={globalSkills}
          error={globalsError}
          search={search}
          onOpenSkillTab={onOpenSkillTab}
        />
      )}
      {tab === 'nakiros' && (
        <NakirosTab
          skills={bundledSkills}
          error={bundledError}
          search={search}
          onOpenSkillTab={onOpenSkillTab}
        />
      )}
      </div>
    </div>
  );
}

// ── Hero mark ──────────────────────────────────────────────────────────────

function NakirosMark() {
  return (
    <img
      src={appIcon}
      alt="Nakiros"
      width={32}
      height={32}
      className="block h-8 w-8 select-none"
      draggable={false}
    />
  );
}

// ── Search input ───────────────────────────────────────────────────────────

function SearchInput({ value, onChange }: { value: string; onChange(v: string): void }) {
  const { t } = useTranslation('home');
  return (
    <div className="inline-flex h-[30px] min-w-[240px] items-center gap-2 rounded-n-md border border-n-border-subtle bg-n-sunken px-2.5">
      <Search size={13} strokeWidth={2} className="text-n-faint" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('searchPlaceholder', {
          defaultValue: 'Search projects, skills, paths…',
        })}
        className="h-full flex-1 bg-transparent text-[12.5px] text-n-fg placeholder:text-n-faint focus:outline-none"
      />
    </div>
  );
}

// ── Projects tab ───────────────────────────────────────────────────────────

function ProjectsTab({
  projects,
  kind,
  search,
  onOpen,
}: {
  projects: Project[];
  /** Determines which i18n section to use for labels. */
  kind: 'claude' | 'cowork';
  search: string;
  onOpen(projectId: string): void;
}) {
  const { t } = useTranslation('home');
  const tabKey = kind === 'cowork' ? 'coworkTab' : 'projectsTab';
  const [aggregates, setAggregates] = useState<Map<string, ProjectAggregate>>(new Map());

  // Stale-while-revalidate: read every project's persisted aggregate so the
  // cards paint instantly, then trigger a background refresh on the daemon.
  // The daemon broadcasts `project:aggregateUpdated` per project, which we
  // subscribe to via `onProjectAggregateUpdated` to swap each card's data
  // in as it lands. Errors per project are swallowed silently.
  useEffect(() => {
    let cancelled = false;
    if (projects.length === 0) {
      setAggregates(new Map());
      return;
    }

    // Phase 1 — instant paint from cache.
    Promise.all(
      projects.map(async (p) => {
        try {
          const agg = await window.nakiros.getProjectAggregate(p.id);
          return agg;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setAggregates((prev) => {
        const next = new Map(prev);
        for (const agg of results) {
          if (agg) next.set(agg.projectId, agg);
        }
        return next;
      });
    });

    // Phase 2 — kick off background revalidation. Results land via the
    // `aggregateUpdated` broadcast subscription below.
    for (const p of projects) {
      window.nakiros.refreshProjectAggregate(p.id).catch(() => undefined);
    }

    const unsubscribe = window.nakiros.onProjectAggregateUpdated((agg) => {
      if (cancelled) return;
      setAggregates((prev) => {
        const next = new Map(prev);
        next.set(agg.projectId, agg);
        return next;
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projects]);

  const filtered = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.projectPath.toLowerCase().includes(q),
    );
  }, [projects, search]);

  return (
    <div>
      <SectionLabel
        right={
          <span className="font-n-mono text-[11px] text-n-faint">
            {t(`${tabKey}.found`, { count: filtered.length, defaultValue: '{{count}} found' })} ·{' '}
            {t(`${tabKey}.scannedFrom`, { defaultValue: 'scanned ~/.claude/projects' })}
          </span>
        }
      >
        {t(`${tabKey}.heading`, { defaultValue: kind === 'cowork' ? 'Cowork projects' : 'Claude Code projects' })}
      </SectionLabel>
      {filtered.length === 0 ? (
        <EmptyCard
          text={
            search
              ? t(`${tabKey}.noMatch`, { defaultValue: 'No project matches your search.' })
              : t(`${tabKey}.empty`, { defaultValue: 'No project scanned yet.' })
          }
        />
      ) : (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              agg={aggregates.get(project.id) ?? null}
              onOpen={() => onOpen(project.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  agg,
  onOpen,
}: {
  project: Project;
  agg: ProjectAggregate | null;
  onOpen(): void;
}) {
  const scoreColor =
    agg?.score == null
      ? 'var(--n-fg-faint)'
      : agg.score >= 80
        ? 'var(--n-healthy)'
        : agg.score >= 65
          ? 'var(--n-accent)'
          : agg.score >= 50
            ? 'var(--n-watch)'
            : 'var(--n-critical)';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex flex-col overflow-hidden rounded-n-lg border border-n-border-subtle bg-n-surface p-3.5 text-left transition-all hover:-translate-y-px hover:border-n-border-strong"
    >
      {/* Accent bar — tinted by the project score so the visual cue
          matches the number rendered on the right of the card. */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-70"
        style={{ background: `linear-gradient(90deg, ${scoreColor} 0%, transparent 60%)` }}
      />

      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            <strong className="truncate font-n-mono text-[14px] font-medium text-n-fg">
              {project.name}
            </strong>
            {project.skillCount > 0 && (
              <span className="rounded-n-xs border border-n-accent-line bg-n-accent-soft px-1.5 py-0.5 font-n-mono text-[10px] text-n-accent-strong">
                {project.skillCount} skills
              </span>
            )}
          </div>
          <div
            className="truncate font-n-mono text-[11.5px] text-n-faint"
            title={project.projectPath}
          >
            {project.projectPath}
          </div>
        </div>
        <div className="text-right font-n-mono tabular-nums">
          <div className="text-[22px] font-medium leading-none" style={{ color: scoreColor }}>
            {agg?.score == null ? '—' : agg.score}
          </div>
          <div className="mt-1 text-[9.5px] uppercase tracking-[0.8px] text-n-faint">score</div>
        </div>
      </div>

      {/* Health bar */}
      <div className="mt-3.5 flex items-center gap-3.5">
        <div className="flex-1">
          <HealthMicroBar
            healthy={agg?.healthy ?? 0}
            watch={agg?.watch ?? 0}
            critical={agg?.critical ?? 0}
          />
        </div>
        <span className="font-n-mono text-[11px] tabular-nums text-n-muted">
          {agg ? agg.totalConvs : project.sessionCount} convs
        </span>
      </div>

      {/* Footer stats */}
      <div className="mt-2.5 flex items-center gap-2.5 font-n-mono text-[11px] text-n-subtle">
        {agg ? (
          <>
            <span style={{ color: 'var(--n-healthy)' }}>● {agg.healthy}</span>
            <span style={{ color: 'var(--n-watch)' }}>● {agg.watch}</span>
            <span style={{ color: 'var(--n-critical)' }}>● {agg.critical}</span>
            <span className="text-n-faint">·</span>
            <span>{formatTokens(agg.totalTokens)} tokens</span>
          </>
        ) : (
          <span className="text-n-faint">loading metrics…</span>
        )}
        <span className="text-n-faint">·</span>
        <span>last {formatRelative(project.lastActivityAt)}</span>
        <span className="flex-1" />
        <ChevronRight
          size={13}
          strokeWidth={2.25}
          className="text-n-faint transition-colors group-hover:text-n-accent"
        />
      </div>
    </button>
  );
}

function HealthMicroBar({
  healthy,
  watch,
  critical,
}: {
  healthy: number;
  watch: number;
  critical: number;
}) {
  const total = Math.max(healthy + watch + critical, 1);
  const h = (healthy / total) * 100;
  const w = (watch / total) * 100;
  const c = (critical / total) * 100;
  return (
    <div className="flex h-1 w-full gap-px overflow-hidden rounded-full bg-n-sunken">
      <div className="h-full bg-n-healthy" style={{ width: `${h}%` }} />
      <div className="h-full bg-n-watch" style={{ width: `${w}%` }} />
      <div className="h-full bg-n-critical" style={{ width: `${c}%` }} />
    </div>
  );
}

// ── Plugins tab — grouped by marketplace ───────────────────────────────────

interface MarketplaceSummary {
  marketplaceName: string;
  pluginCount: number;
  skillCount: number;
  totalEvals: number;
  totalAudits: number;
  averageScore: number | null;
}

function PluginsTab({
  skills,
  error,
  search,
  onOpenMarketplaceTab,
}: {
  skills: Skill[] | null;
  error: string | null;
  search: string;
  onOpenMarketplaceTab(marketplaceName: string, label: string): void;
}) {
  const { t } = useTranslation('home');

  const marketplaces = useMemo<MarketplaceSummary[]>(() => {
    if (!skills) return [];
    const byMarketplace = new Map<string, Skill[]>();
    for (const skill of skills) {
      const key = skill.marketplaceName ?? '';
      const list = byMarketplace.get(key) ?? [];
      list.push(skill);
      byMarketplace.set(key, list);
    }
    const out: MarketplaceSummary[] = [];
    for (const [marketplaceName, group] of byMarketplace) {
      const distinctPlugins = new Set(group.map((s) => s.pluginName ?? '__unknown'));
      const scores = group
        .map((s) => s.evals?.latestPassRate)
        .filter((v): v is number => typeof v === 'number');
      const averageScore =
        scores.length > 0
          ? Math.round((scores.reduce((acc, v) => acc + v, 0) / scores.length) * 100)
          : null;
      out.push({
        marketplaceName,
        pluginCount: distinctPlugins.size,
        skillCount: group.length,
        totalEvals: group.reduce((acc, s) => acc + (s.evals?.definitions.length ?? 0), 0),
        totalAudits: group.reduce((acc, s) => acc + s.auditCount, 0),
        averageScore,
      });
    }
    return out.sort((a, b) => a.marketplaceName.localeCompare(b.marketplaceName));
  }, [skills]);

  const filtered = useMemo(() => {
    if (!search.trim()) return marketplaces;
    const q = search.toLowerCase();
    return marketplaces.filter((m) => m.marketplaceName.toLowerCase().includes(q));
  }, [marketplaces, search]);

  if (error) {
    return (
      <div className="rounded-n-md border border-n-critical bg-n-critical-soft px-3 py-2 font-n-mono text-[12px] text-n-critical">
        {error}
      </div>
    );
  }

  if (skills === null) {
    return <LoadingState text={t('common:loading', { defaultValue: 'Loading…' })} />;
  }

  if (marketplaces.length === 0) {
    return (
      <EmptyCard text={t('pluginsTab.empty', { defaultValue: 'No plugin skill detected.' })} />
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyCard
        text={t('pluginsTab.noMatch', { defaultValue: 'No marketplace matches your search.' })}
      />
    );
  }

  return (
    <div>
      <SectionLabel>
        {t('pluginsTab.heading', { defaultValue: 'Marketplaces' })}
      </SectionLabel>
      <div className="grid gap-2">
        {filtered.map((m) => (
          <MarketplaceRow
            key={m.marketplaceName || '__unnamed'}
            summary={m}
            onOpen={() =>
              onOpenMarketplaceTab(
                m.marketplaceName,
                m.marketplaceName || t('marketplace.unnamed', { defaultValue: 'unnamed' }),
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

function MarketplaceRow({
  summary,
  onOpen,
}: {
  summary: MarketplaceSummary;
  onOpen(): void;
}) {
  const { t } = useTranslation('home');
  const tone =
    summary.averageScore === null
      ? 'var(--n-fg-faint)'
      : summary.averageScore >= 85
        ? 'var(--n-healthy)'
        : summary.averageScore >= 70
          ? 'var(--n-accent)'
          : 'var(--n-watch)';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex items-center gap-3.5 rounded-n-md border border-n-border-subtle bg-n-surface px-4 py-3 text-left transition-colors hover:border-n-border-strong hover:bg-n-raised"
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-n-sm bg-n-accent-soft text-n-accent">
        <Plug size={14} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-n-mono text-[13.5px] font-medium text-n-fg">
          {summary.marketplaceName ||
            t('marketplace.unnamed', { defaultValue: 'unnamed' })}
        </div>
        <div className="mt-0.5 font-n-mono text-[11px] text-n-subtle">
          {summary.pluginCount} plugin{summary.pluginCount > 1 ? 's' : ''} · {summary.skillCount}{' '}
          skill{summary.skillCount > 1 ? 's' : ''}
          {summary.totalEvals > 0 && <> · {summary.totalEvals} evals</>}
          {summary.totalAudits > 0 && <> · {summary.totalAudits} audits</>}
        </div>
      </div>
      {summary.averageScore !== null && (
        <span
          className="inline-flex items-center rounded-n-xs border px-2 py-0.5 font-n-mono text-[11px] tabular-nums"
          style={{
            background: `${tone}14`,
            color: tone,
            borderColor: `${tone}33`,
          }}
        >
          {summary.averageScore}
        </span>
      )}
      <ChevronRight
        size={14}
        strokeWidth={2}
        className="text-n-faint transition-colors group-hover:text-n-accent"
      />
    </button>
  );
}

// ── Globals tab ────────────────────────────────────────────────────────────

function GlobalsTab({
  skills,
  error,
  search,
  onOpenSkillTab,
}: {
  skills: Skill[] | null;
  error: string | null;
  search: string;
  onOpenSkillTab(identity: SkillTabIdentity, label: string): void;
}) {
  const { t } = useTranslation('home');

  const filtered = useMemo(() => {
    if (!skills) return [];
    if (!search.trim()) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      (s) => s.name.toLowerCase().includes(q) || s.skillPath.toLowerCase().includes(q),
    );
  }, [skills, search]);

  if (error) {
    return (
      <div className="rounded-n-md border border-n-critical bg-n-critical-soft px-3 py-2 font-n-mono text-[12px] text-n-critical">
        {error}
      </div>
    );
  }

  if (skills === null) {
    return <LoadingState text={t('common:loading', { defaultValue: 'Loading…' })} />;
  }

  if (skills.length === 0) {
    return (
      <EmptyCard
        text={t('globalsTab.empty', { defaultValue: 'No skill installed in ~/.claude/skills.' })}
      />
    );
  }

  if (filtered.length === 0) {
    return <EmptyCard text={t('globalsTab.noMatch', { defaultValue: 'No global matches your search.' })} />;
  }

  return (
    <div>
      <SectionLabel>
        {t('globalsTab.heading', { defaultValue: 'Skills installed at ~/.claude/skills' })}
      </SectionLabel>
      <div className="grid gap-1.5">
        {filtered.map((skill) => (
          <GlobalRow key={skill.name} skill={skill} onOpenSkillTab={onOpenSkillTab} />
        ))}
      </div>
    </div>
  );
}

function GlobalRow({
  skill,
  onOpenSkillTab,
}: {
  skill: Skill;
  onOpenSkillTab(identity: SkillTabIdentity, label: string): void;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onOpenSkillTab({ scope: 'claude-global', skillName: skill.name }, skill.name)
      }
      className="flex w-full items-center gap-3.5 rounded-n-md border border-n-border-subtle bg-n-surface px-3.5 py-2.5 text-left transition-colors hover:bg-n-raised"
    >
      <Sparkles size={13} strokeWidth={2.25} className="text-n-accent" />
      <span className="font-n-mono text-[13px] font-medium text-n-fg">{skill.name}</span>
      <span className="flex-1" />
      <span className="truncate font-n-mono text-[11px] text-n-faint" title={skill.skillPath}>
        {skill.skillPath}
      </span>
      <SkillScoreBadge skill={skill} />
      <ChevronRight size={12} strokeWidth={2} className="text-n-faint" />
    </button>
  );
}

// ── Nakiros bundled skills tab ─────────────────────────────────────────────

function NakirosTab({
  skills,
  error,
  search,
  onOpenSkillTab,
}: {
  skills: Skill[] | null;
  error: string | null;
  search: string;
  onOpenSkillTab(identity: SkillTabIdentity, label: string): void;
}) {
  const { t } = useTranslation('home');

  const filtered = useMemo(() => {
    if (!skills) return [];
    if (!search.trim()) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      (s) => s.name.toLowerCase().includes(q) || s.skillPath.toLowerCase().includes(q),
    );
  }, [skills, search]);

  if (error) {
    return (
      <div className="rounded-n-md border border-n-critical bg-n-critical-soft px-3 py-2 font-n-mono text-[12px] text-n-critical">
        {error}
      </div>
    );
  }

  if (skills === null) {
    return <LoadingState text={t('common:loading', { defaultValue: 'Loading…' })} />;
  }

  if (skills.length === 0) {
    return (
      <EmptyCard
        text={t('nakirosTab.empty', { defaultValue: 'No bundled skill installed.' })}
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyCard text={t('nakirosTab.noMatch', { defaultValue: 'No bundled skill matches your search.' })} />
    );
  }

  return (
    <div>
      <SectionLabel>
        {t('nakirosTab.heading', { defaultValue: 'Skills bundled with Nakiros' })}
      </SectionLabel>
      <div className="grid gap-1.5">
        {filtered.map((skill) => (
          <BundledRow key={skill.name} skill={skill} onOpenSkillTab={onOpenSkillTab} />
        ))}
      </div>
    </div>
  );
}

function BundledRow({
  skill,
  onOpenSkillTab,
}: {
  skill: Skill;
  onOpenSkillTab(identity: SkillTabIdentity, label: string): void;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onOpenSkillTab({ scope: 'nakiros-bundled', skillName: skill.name }, skill.name)
      }
      className="flex w-full items-center gap-3.5 rounded-n-md border border-n-border-subtle bg-n-surface px-3.5 py-2.5 text-left transition-colors hover:bg-n-raised"
    >
      <Layers size={13} strokeWidth={2.25} className="text-n-violet" />
      <span className="font-n-mono text-[13px] font-medium text-n-fg">{skill.name}</span>
      <span className="flex-1" />
      <span className="truncate font-n-mono text-[11px] text-n-faint" title={skill.skillPath}>
        {skill.skillPath}
      </span>
      <SkillScoreBadge skill={skill} />
      <ChevronRight size={12} strokeWidth={2} className="text-n-faint" />
    </button>
  );
}

function SkillScoreBadge({ skill }: { skill: Skill }) {
  const latest = skill.evals?.latestPassRate;
  const score = typeof latest === 'number' ? Math.round(latest * 100) : null;
  if (score === null) return null;
  const tone =
    score >= 85
      ? 'var(--n-healthy)'
      : score >= 70
        ? 'var(--n-accent)'
        : 'var(--n-watch)';
  return (
    <span
      className="inline-flex items-center rounded-n-xs border px-1.5 py-0.5 font-n-mono text-[10.5px] tabular-nums"
      style={{
        background: `${tone}14`,
        color: tone,
        borderColor: `${tone}33`,
      }}
    >
      {score}
    </span>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────

function SectionLabel({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
      <span>{children}</span>
      {right}
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface px-4 py-10 text-center font-n-mono text-[12px] text-n-faint">
      {text}
    </div>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 px-1 font-n-mono text-[12px] text-n-muted">
      <RefreshCw size={12} className="animate-spin" />
      {text}
    </div>
  );
}

function DismissedToggle({
  open,
  count,
  onToggle,
}: {
  open: boolean;
  count: number | null;
  onToggle(): void;
}) {
  const { t } = useTranslation('home');
  return (
    <div className="mt-6 flex items-center justify-end">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded-n-xs px-2 py-1 font-n-mono text-[11px] text-n-faint transition-colors hover:bg-n-raised hover:text-n-muted"
      >
        <ChevronRight
          size={11}
          strokeWidth={2}
          className={'transition-transform ' + (open ? 'rotate-90' : '')}
        />
        {open
          ? t('dismissed.hide', { defaultValue: 'Hide dismissed' })
          : t('dismissed.show', { defaultValue: 'Show dismissed' })}
        {count !== null && count > 0 && (
          <span className="tabular-nums text-n-subtle">· {count}</span>
        )}
      </button>
    </div>
  );
}

function DismissedSection({
  projects,
  error,
  search,
  restoringId,
  onRestore,
}: {
  projects: Project[] | null;
  error: string | null;
  search: string;
  restoringId: string | null;
  onRestore(id: string): void;
}) {
  const { t } = useTranslation('home');

  const filtered = useMemo(() => {
    if (!projects) return null;
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.projectPath.toLowerCase().includes(q),
    );
  }, [projects, search]);

  if (error) {
    return (
      <div className="mt-2 rounded-n-md border border-n-critical bg-n-critical-soft px-3 py-2 font-n-mono text-[12px] text-n-critical">
        {error}
      </div>
    );
  }

  if (!projects || !filtered) {
    return (
      <div className="mt-2">
        <LoadingState text={t('common:loading', { defaultValue: 'Loading…' })} />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="mt-2 rounded-n-md border border-dashed border-n-border-default bg-n-surface px-3 py-3 text-center font-n-mono text-[11.5px] text-n-faint">
        {t('dismissed.empty', { defaultValue: 'No dismissed project.' })}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="mt-2 rounded-n-md border border-dashed border-n-border-default bg-n-surface px-3 py-3 text-center font-n-mono text-[11.5px] text-n-faint">
        {t('dismissed.noMatch', { defaultValue: 'No dismissed project matches your search.' })}
      </div>
    );
  }

  // Use the EXACT same grid template as the active project cards so each
  // dismissed row inherits the cards' bounding box. `col-span-full` makes a
  // single row span every column the cards grid would have, guaranteeing
  // identical right/left edges regardless of viewport width.
  return (
    <div className="mt-2">
      <div className="mb-2 font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
        {t('dismissed.heading', { defaultValue: 'Dismissed projects' })}
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}
      >
        {filtered.map((p) => (
          <div
            key={p.id}
            className="col-span-full flex min-w-0 items-center gap-3 rounded-n-md border border-n-border-subtle bg-n-surface/40 px-3.5 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-n-mono text-[12.5px] font-medium text-n-muted">
                {p.name}
              </div>
              <div
                className="truncate font-n-mono text-[10.5px] text-n-faint"
                title={p.projectPath}
              >
                {p.projectPath}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRestore(p.id)}
              disabled={restoringId === p.id}
              className="inline-flex h-7 flex-shrink-0 items-center gap-1.5 rounded-n-xs border border-n-border-default bg-transparent px-2.5 font-n-mono text-[11px] text-n-muted hover:bg-n-raised hover:text-n-fg disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw
                size={11}
                strokeWidth={2}
                className={restoringId === p.id ? 'animate-spin' : undefined}
              />
              {t('dismissed.restore', { defaultValue: 'Restore' })}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RescanBanner({ progress }: { progress: ScanProgress | null }) {
  const { t } = useTranslation('home');
  const ratio =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;
  // The disk scan is fast and finishes before aggregate recompute. Detect that
  // boundary by `current >= total` so we can swap the label without needing a
  // second progress channel from the daemon.
  const scanFinished =
    progress != null && progress.total > 0 && progress.current >= progress.total;
  const label = !progress
    ? t('rescanBanner.starting', { defaultValue: 'Starting scan…' })
    : scanFinished
      ? t('rescanBanner.refreshing', {
          defaultValue: 'Refreshing project metrics…',
        })
      : t('rescanBanner.scanning', {
          current: progress.current,
          total: progress.total,
          defaultValue: 'Scanning · {{current}}/{{total}}',
        });
  return (
    <div className="mb-4 overflow-hidden rounded-n-md border border-n-border-subtle bg-n-surface">
      <div className="flex items-center gap-2.5 px-3 py-2 font-n-mono text-[12px] text-n-muted">
        <RefreshCw size={12} className="animate-spin text-n-accent" />
        <span>{label}</span>
        {!scanFinished && progress?.projectName && (
          <span className="truncate text-n-faint">· {progress.projectName}</span>
        )}
      </div>
      <div className="h-0.5 w-full bg-n-sunken">
        <div
          className={
            'h-full bg-n-accent transition-[width] duration-200' +
            (scanFinished ? ' animate-pulse' : '')
          }
          style={{ width: scanFinished ? '100%' : `${ratio}%` }}
        />
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function countDistinctPlugins(skills: Skill[]): number {
  const set = new Set<string>();
  for (const skill of skills) {
    const key = `${skill.marketplaceName ?? ''}::${skill.pluginName ?? skill.name}`;
    set.add(key);
  }
  return set.size;
}

function formatRelative(iso: string | undefined | null): string {
  if (!iso) return '—';
  const ts = new Date(iso);
  if (Number.isNaN(ts.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - ts.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return ts.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}
