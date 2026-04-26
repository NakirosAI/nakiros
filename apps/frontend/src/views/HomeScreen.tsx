import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  Folder,
  Globe,
  Layers,
  Plug,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import type { ConversationAnalysis, Project, Skill } from '@nakiros/shared';

interface HomeScreenProps {
  /** Projects loaded by App.tsx at boot — cheap pre-render data. */
  projects: Project[];
  /** Boot error to surface above the project grid (optional). */
  bootError?: string;
  /** Activated when the user clicks a project card. */
  onOpenProject(projectId: string): void;
  /** Triggered by the "Rescan" hero action. */
  onRescan(): void;
  /** Triggered by per-project dismiss action — currently unused but kept
   *  for parity with the legacy `Home` API. */
  onDismissProject(projectId: string): Promise<void>;
}

type HomeTabKey = 'projects' | 'plugins' | 'globals';

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
}: HomeScreenProps) {
  const { t } = useTranslation('home');
  const [tab, setTab] = useState<HomeTabKey>('projects');
  const [search, setSearch] = useState('');

  const [pluginSkills, setPluginSkills] = useState<Skill[] | null>(null);
  const [pluginsError, setPluginsError] = useState<string | null>(null);
  const [globalSkills, setGlobalSkills] = useState<Skill[] | null>(null);
  const [globalsError, setGlobalsError] = useState<string | null>(null);

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

  const tabs: Array<{ id: HomeTabKey; label: string; icon: React.ReactNode; count: number | null }> = [
    {
      id: 'projects',
      label: t('tabs.projects', { defaultValue: 'Projects' }),
      icon: <Folder size={13} strokeWidth={2} />,
      count: projects.length,
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
            disabled
            className="inline-flex h-8 items-center gap-1.5 rounded-n-sm border border-n-border-default bg-transparent px-3 font-n-mono text-[12px] text-n-muted opacity-60"
          >
            <Layers size={13} strokeWidth={2} />
            {t('hero.nakirosSkills', { defaultValue: 'Nakiros Skills' })}
          </button>
          <button
            type="button"
            onClick={onRescan}
            className="inline-flex h-8 items-center gap-1.5 rounded-n-sm bg-transparent px-3 font-n-mono text-[12px] text-n-muted hover:bg-n-raised hover:text-n-fg"
          >
            <RefreshCw size={13} strokeWidth={2} />
            {t('hero.rescan', { defaultValue: 'Rescan' })}
          </button>
        </div>
      </div>

      {bootError && (
        <div className="mb-4 rounded-n-md border border-n-critical bg-n-critical-soft px-3 py-2 font-n-mono text-[12px] text-n-critical">
          {bootError}
        </div>
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
        <ProjectsTab projects={projects} search={search} onOpen={onOpenProject} />
      )}
      {tab === 'plugins' && (
        <PluginsTab skills={pluginSkills} error={pluginsError} search={search} />
      )}
      {tab === 'globals' && (
        <GlobalsTab skills={globalSkills} error={globalsError} search={search} />
      )}
      </div>
    </div>
  );
}

// ── Hero mark ──────────────────────────────────────────────────────────────

function NakirosMark() {
  // Simple OKLch geometric mark — kept inline to avoid pulling an asset.
  return (
    <span
      aria-hidden
      className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-n-md"
      style={{
        background: 'var(--n-accent-soft)',
        border: '1px solid var(--n-accent-line)',
      }}
    >
      <Sparkles size={15} strokeWidth={2.25} className="text-n-accent" />
    </span>
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
      <span className="rounded-n-xs border border-n-border-default bg-n-raised px-1.5 py-0.5 font-n-mono text-[10.5px] text-n-muted">
        ⌘K
      </span>
    </div>
  );
}

// ── Projects tab ───────────────────────────────────────────────────────────

interface ProjectAggregate {
  score: number | null;
  healthy: number;
  watch: number;
  critical: number;
  totalConvs: number;
  totalTokens: number;
}

function ProjectsTab({
  projects,
  search,
  onOpen,
}: {
  projects: Project[];
  search: string;
  onOpen(projectId: string): void;
}) {
  const { t } = useTranslation('home');
  const [aggregates, setAggregates] = useState<Map<string, ProjectAggregate>>(new Map());

  // Fetch every project's conversation analyses in parallel on mount
  // so the cards can render score / health / tokens. Each card shows
  // a placeholder until its aggregate lands. Errors per project are
  // swallowed silently — the card just stays in skeleton state.
  useEffect(() => {
    let cancelled = false;
    setAggregates(new Map());
    if (projects.length === 0) return;

    const tasks = projects.map(async (project) => {
      try {
        const analyses = await window.nakiros.listProjectConversationsWithAnalysis(project.id);
        return { id: project.id, agg: aggregateAnalyses(analyses) };
      } catch {
        return { id: project.id, agg: null as ProjectAggregate | null };
      }
    });

    Promise.all(tasks).then((results) => {
      if (cancelled) return;
      setAggregates(() => {
        const next = new Map<string, ProjectAggregate>();
        for (const { id, agg } of results) {
          if (agg) next.set(id, agg);
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
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
            {t('projectsTab.found', { count: filtered.length, defaultValue: '{{count}} found' })} ·{' '}
            {t('projectsTab.scannedFrom', { defaultValue: 'scanned ~/.claude/projects' })}
          </span>
        }
      >
        {t('projectsTab.heading', { defaultValue: 'Projects' })}
      </SectionLabel>
      {filtered.length === 0 ? (
        <EmptyCard
          text={
            search
              ? t('projectsTab.noMatch', { defaultValue: 'No project matches your search.' })
              : t('projectsTab.empty', { defaultValue: 'No project scanned yet.' })
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

// ── Plugins tab ────────────────────────────────────────────────────────────

interface PluginGroup {
  marketplaceName: string | null;
  pluginName: string;
  skills: Skill[];
}

function PluginsTab({
  skills,
  error,
  search,
}: {
  skills: Skill[] | null;
  error: string | null;
  search: string;
}) {
  const { t } = useTranslation('home');

  const grouped = useMemo<PluginGroup[]>(() => {
    if (!skills) return [];
    const map = new Map<string, PluginGroup>();
    for (const skill of skills) {
      const pluginName = skill.pluginName ?? 'unknown';
      const key = `${skill.marketplaceName ?? ''}::${pluginName}`;
      let group = map.get(key);
      if (!group) {
        group = { marketplaceName: skill.marketplaceName ?? null, pluginName, skills: [] };
        map.set(key, group);
      }
      group.skills.push(skill);
    }
    return Array.from(map.values()).sort((a, b) => a.pluginName.localeCompare(b.pluginName));
  }, [skills]);

  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    return grouped.filter(
      (g) =>
        g.pluginName.toLowerCase().includes(q) ||
        (g.marketplaceName?.toLowerCase().includes(q) ?? false) ||
        g.skills.some((s) => s.name.toLowerCase().includes(q)),
    );
  }, [grouped, search]);

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

  if (grouped.length === 0) {
    return <EmptyCard text={t('pluginsTab.empty', { defaultValue: 'No plugin skill detected.' })} />;
  }

  if (filtered.length === 0) {
    return (
      <EmptyCard text={t('pluginsTab.noMatch', { defaultValue: 'No plugin matches your search.' })} />
    );
  }

  return (
    <div className="grid gap-2">
      {filtered.map((group) => (
        <PluginRow key={`${group.marketplaceName}::${group.pluginName}`} group={group} />
      ))}
    </div>
  );
}

function PluginRow({ group }: { group: PluginGroup }) {
  const totalAudits = group.skills.reduce((acc, s) => acc + s.auditCount, 0);
  const totalEvals = group.skills.reduce((acc, s) => acc + (s.evals?.definitions.length ?? 0), 0);
  return (
    <div className="flex items-center gap-3.5 rounded-n-md border border-n-border-subtle bg-n-surface px-4 py-3">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-n-sm bg-n-sunken">
        <Plug size={13} strokeWidth={2} className="text-n-accent" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-n-mono text-[13px] text-n-fg">{group.pluginName}</span>
          {group.marketplaceName && (
            <span className="font-n-mono text-[10.5px] text-n-faint">
              · {group.marketplaceName}
            </span>
          )}
        </div>
        <div className="mt-0.5 font-n-mono text-[11px] text-n-subtle">
          {group.skills.length} skill{group.skills.length > 1 ? 's' : ''}
          {totalEvals > 0 && <> · {totalEvals} evals</>}
          {totalAudits > 0 && <> · {totalAudits} audits</>}
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 font-n-mono text-[10.5px] text-n-healthy">
        <span className="h-1.5 w-1.5 rounded-full bg-n-healthy" />
        enabled
      </span>
    </div>
  );
}

// ── Globals tab ────────────────────────────────────────────────────────────

function GlobalsTab({
  skills,
  error,
  search,
}: {
  skills: Skill[] | null;
  error: string | null;
  search: string;
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
          <GlobalRow key={skill.name} skill={skill} />
        ))}
      </div>
    </div>
  );
}

function GlobalRow({ skill }: { skill: Skill }) {
  const latest = skill.evals?.latestPassRate;
  const score = typeof latest === 'number' ? Math.round(latest * 100) : null;
  const scoreTone =
    score === null
      ? 'var(--n-fg-faint)'
      : score >= 85
        ? 'var(--n-healthy)'
        : score >= 70
          ? 'var(--n-accent)'
          : 'var(--n-watch)';
  return (
    <div className="flex items-center gap-3.5 rounded-n-md border border-n-border-subtle bg-n-surface px-3.5 py-2.5">
      <Sparkles size={13} strokeWidth={2.25} className="text-n-accent" />
      <span className="font-n-mono text-[13px] font-medium text-n-fg">{skill.name}</span>
      <span className="flex-1" />
      <span className="truncate font-n-mono text-[11px] text-n-faint" title={skill.skillPath}>
        {skill.skillPath}
      </span>
      {score !== null && (
        <span
          className="inline-flex items-center rounded-n-xs border px-1.5 py-0.5 font-n-mono text-[10.5px] tabular-nums"
          style={{
            background: `${scoreTone}14`,
            color: scoreTone,
            borderColor: `${scoreTone}33`,
          }}
        >
          {score}
        </span>
      )}
    </div>
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

// ── Helpers ────────────────────────────────────────────────────────────────

function aggregateAnalyses(analyses: ConversationAnalysis[]): ProjectAggregate {
  if (analyses.length === 0) {
    return { score: null, healthy: 0, watch: 0, critical: 0, totalConvs: 0, totalTokens: 0 };
  }
  let healthy = 0;
  let watch = 0;
  let critical = 0;
  let scoreSum = 0;
  let tokenSum = 0;
  for (const a of analyses) {
    if (a.healthZone === 'healthy') healthy++;
    else if (a.healthZone === 'watch') watch++;
    else if (a.healthZone === 'degraded') critical++;
    scoreSum += a.score;
    tokenSum += a.totalTokens;
  }
  return {
    score: Math.round(scoreSum / analyses.length),
    healthy,
    watch,
    critical,
    totalConvs: analyses.length,
    totalTokens: tokenSum,
  };
}

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
