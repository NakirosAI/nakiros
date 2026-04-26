import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  FlaskConical,
  Folder,
  Home as HomeIcon,
  Plug,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
} from 'lucide-react';
import type { Skill } from '@nakiros/shared';
import SkillCard, { extractSkillDescription } from '../components/skill/SkillCard';
import type { MarketplaceTabView, SkillTabIdentity } from '../hooks/useTabs';

interface MarketplaceScreenProps {
  /** Marketplace folder name as exposed by `Skill.marketplaceName`. */
  marketplaceName: string;
  /** Active sub-view. Defaults to `'overview'` upstream. */
  view: MarketplaceTabView;
  /** Activated when the user navigates the marketplace sidebar. */
  onNavigate(view: MarketplaceTabView): void;
  /** Opens an individual plugin skill in a `kind: 'skill'` tab. */
  onOpenSkillTab(identity: SkillTabIdentity, label: string): void;
}

/**
 * Marketplace detail screen — accessible from the Plugins tab of the
 * HomeScreen. Shows everything Nakiros has indexed under a single
 * `Skill.marketplaceName`: the plugins it groups, their skills, and a
 * lightweight Overview tab summarising counts.
 *
 * Mirrors the project layout (sidebar + sub-views) but only carries
 * 'Overview' and 'Skills' — marketplaces don't have conversations or
 * recommendations attached.
 *
 * Reads the data through `listPluginSkills()`. The list is filtered
 * client-side to the marketplace name and re-grouped by plugin for
 * the Overview pane.
 */
export default function MarketplaceScreen({
  marketplaceName,
  view,
  onNavigate,
  onOpenSkillTab,
}: MarketplaceScreenProps) {
  const { t } = useTranslation('home');
  const [allSkills, setAllSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAllSkills(null);
    setError(null);
    window.nakiros
      .listPluginSkills()
      .then((skills) => {
        if (cancelled) return;
        setAllSkills(skills);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [marketplaceName]);

  const skills = useMemo(() => {
    if (!allSkills) return [];
    return allSkills.filter((s) => (s.marketplaceName ?? '') === marketplaceName);
  }, [allSkills, marketplaceName]);

  return (
    <div className="flex flex-1 overflow-hidden font-n-sans">
      <Sidebar active={view} onNavigate={onNavigate} />
      <section className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3.5 border-b border-n-border-subtle px-7 py-4">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-n-md bg-n-accent-soft text-n-accent">
            <Store size={14} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <div className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
              {t('marketplace.label', { defaultValue: 'Marketplace' })}
            </div>
            <h1 className="m-0 truncate font-n-mono text-[16px] font-medium text-n-fg">
              {marketplaceName || t('marketplace.unnamed', { defaultValue: 'unnamed' })}
            </h1>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 py-5">
          {error && (
            <div className="rounded-n-md border border-n-critical bg-n-critical-soft px-3 py-2 font-n-mono text-[12px] text-n-critical">
              {error}
            </div>
          )}
          {!error && allSkills === null && (
            <div className="flex items-center gap-2 px-1 font-n-mono text-[12px] text-n-muted">
              <RefreshCw size={12} className="animate-spin" />
              {t('common:loading', { defaultValue: 'Loading…' })}
            </div>
          )}
          {!error && allSkills !== null && view === 'overview' && (
            <OverviewPane skills={skills} marketplaceName={marketplaceName} />
          )}
          {!error && allSkills !== null && view === 'skills' && (
            <SkillsPane
              skills={skills}
              marketplaceName={marketplaceName}
              onOpenSkillTab={onOpenSkillTab}
            />
          )}
        </div>
      </section>
    </div>
  );
}

// ── Sidebar (overview / skills only) ───────────────────────────────────────

function Sidebar({
  active,
  onNavigate,
}: {
  active: MarketplaceTabView;
  onNavigate(view: MarketplaceTabView): void;
}) {
  const items: Array<{ id: MarketplaceTabView; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <HomeIcon size={18} strokeWidth={2} /> },
    { id: 'skills', label: 'Skills', icon: <Sparkles size={18} strokeWidth={2} /> },
  ];
  return (
    <aside className="flex w-14 flex-shrink-0 flex-col items-center border-r border-n-border-subtle bg-n-sunken pt-3.5 pb-3">
      <nav className="flex flex-1 flex-col items-center gap-1 pt-3">
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={
                'flex h-10 w-10 items-center justify-center rounded-n-md border transition-colors ' +
                (isActive
                  ? 'border-n-accent-line bg-n-accent-soft text-n-accent-strong'
                  : 'border-transparent text-n-subtle hover:bg-n-raised hover:text-n-fg')
              }
            >
              {item.icon}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

// ── Overview pane ──────────────────────────────────────────────────────────

interface PluginSummary {
  pluginName: string;
  skillCount: number;
  totalEvals: number;
  totalAudits: number;
  averageScore: number | null;
}

function OverviewPane({
  skills,
  marketplaceName,
}: {
  skills: Skill[];
  marketplaceName: string;
}) {
  const { t } = useTranslation('home');

  const plugins = useMemo<PluginSummary[]>(() => {
    const map = new Map<string, Skill[]>();
    for (const skill of skills) {
      const key = skill.pluginName ?? 'unknown';
      const list = map.get(key) ?? [];
      list.push(skill);
      map.set(key, list);
    }
    const out: PluginSummary[] = [];
    for (const [pluginName, group] of map) {
      const scores = group
        .map((s) => s.evals?.latestPassRate)
        .filter((v): v is number => typeof v === 'number');
      const averageScore =
        scores.length > 0
          ? Math.round((scores.reduce((acc, v) => acc + v, 0) / scores.length) * 100)
          : null;
      out.push({
        pluginName,
        skillCount: group.length,
        totalEvals: group.reduce((acc, s) => acc + (s.evals?.definitions.length ?? 0), 0),
        totalAudits: group.reduce((acc, s) => acc + s.auditCount, 0),
        averageScore,
      });
    }
    return out.sort((a, b) => a.pluginName.localeCompare(b.pluginName));
  }, [skills]);

  const totalEvals = plugins.reduce((acc, p) => acc + p.totalEvals, 0);
  const totalAudits = plugins.reduce((acc, p) => acc + p.totalAudits, 0);

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KPI
          icon={<Plug size={13} strokeWidth={2} />}
          label={t('marketplace.kpiPlugins', { defaultValue: 'Plugins' })}
          value={plugins.length.toString()}
        />
        <KPI
          icon={<Sparkles size={13} strokeWidth={2} />}
          label={t('marketplace.kpiSkills', { defaultValue: 'Skills' })}
          value={skills.length.toString()}
        />
        <KPI
          icon={<FlaskConical size={13} strokeWidth={2} />}
          label={t('marketplace.kpiEvals', { defaultValue: 'Evals' })}
          value={totalEvals.toString()}
        />
        <KPI
          icon={<ShieldCheck size={13} strokeWidth={2} />}
          label={t('marketplace.kpiAudits', { defaultValue: 'Audits' })}
          value={totalAudits.toString()}
        />
      </div>

      {/* Plugins list */}
      <section>
        <SectionLabel
          right={
            <span className="font-n-mono text-[11px] text-n-faint">
              {plugins.length} plugin{plugins.length > 1 ? 's' : ''}
            </span>
          }
        >
          {t('marketplace.pluginsHeading', { defaultValue: 'Plugins' })}
        </SectionLabel>
        {plugins.length === 0 ? (
          <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface px-4 py-8 text-center font-n-mono text-[11.5px] text-n-faint">
            {t('marketplace.noPlugins', {
              defaultValue: 'No plugin found in this marketplace.',
            })}
          </div>
        ) : (
          <div className="grid gap-2">
            {plugins.map((p) => (
              <PluginRow key={`${marketplaceName}::${p.pluginName}`} summary={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function KPI({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-n-lg border border-n-border-subtle bg-n-surface p-3.5">
      <div className="flex items-center justify-between">
        <span className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
          {label}
        </span>
        <span className="text-n-faint">{icon}</span>
      </div>
      <div className="mt-2 font-n-mono text-[24px] font-medium tabular-nums text-n-fg">
        {value}
      </div>
    </div>
  );
}

function PluginRow({ summary }: { summary: PluginSummary }) {
  const tone =
    summary.averageScore === null
      ? 'var(--n-fg-faint)'
      : summary.averageScore >= 85
        ? 'var(--n-healthy)'
        : summary.averageScore >= 70
          ? 'var(--n-accent)'
          : 'var(--n-watch)';
  return (
    <div className="flex items-center gap-3.5 rounded-n-md border border-n-border-subtle bg-n-surface px-4 py-2.5">
      <Folder size={13} strokeWidth={2} className="text-n-accent" />
      <span className="font-n-mono text-[13px] text-n-fg">{summary.pluginName}</span>
      <span className="flex-1" />
      <span className="font-n-mono text-[11px] text-n-subtle">
        {summary.skillCount} skill{summary.skillCount > 1 ? 's' : ''}
      </span>
      {summary.averageScore !== null && (
        <span
          className="inline-flex items-center rounded-n-xs border px-1.5 py-0.5 font-n-mono text-[10.5px] tabular-nums"
          style={{
            background: `${tone}14`,
            color: tone,
            borderColor: `${tone}33`,
          }}
        >
          {summary.averageScore}
        </span>
      )}
    </div>
  );
}

// ── Skills pane ────────────────────────────────────────────────────────────

function SkillsPane({
  skills,
  marketplaceName,
  onOpenSkillTab,
}: {
  skills: Skill[];
  marketplaceName: string;
  onOpenSkillTab(identity: SkillTabIdentity, label: string): void;
}) {
  const { t } = useTranslation('home');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return skills;
    const q = query.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.pluginName?.toLowerCase().includes(q) ?? false) ||
        extractSkillDescription(s.content).toLowerCase().includes(q),
    );
  }, [skills, query]);

  if (skills.length === 0) {
    return (
      <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface px-4 py-10 text-center font-n-mono text-[12px] text-n-faint">
        {t('marketplace.noSkills', {
          defaultValue: 'No skill in this marketplace yet.',
        })}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
          {t('marketplace.allSkills', { count: skills.length, defaultValue: 'All skills · {{count}}' })}
        </div>
        <div className="relative">
          <Search
            size={13}
            strokeWidth={2}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-n-subtle"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('marketplace.searchPlaceholder', { defaultValue: 'Search skills…' })}
            className="h-7 w-56 rounded-n-sm border border-n-border-subtle bg-n-sunken pl-7 pr-2.5 font-n-mono text-[12px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface px-4 py-8 text-center font-n-mono text-[12px] text-n-faint">
          {t('marketplace.noMatch', { defaultValue: 'No skill matches your search.' })}
        </div>
      ) : (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))' }}>
          {filtered.map((skill) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              onOpen={() =>
                onOpenSkillTab(
                  {
                    scope: 'plugin',
                    marketplaceName,
                    pluginName: skill.pluginName ?? '',
                    skillName: skill.name,
                  },
                  skill.name,
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared ─────────────────────────────────────────────────────────────────

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
