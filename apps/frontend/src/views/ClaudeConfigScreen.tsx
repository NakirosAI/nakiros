import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpRight,
  Bot,
  Cog,
  FileText,
  Layers,
  Plug,
  Sliders,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import type { Project } from '@nakiros/shared';
import { useClaudeConfig } from './claude-config/useClaudeConfig';
import ClaudeConfigDrawer, {
  type ClaudeConfigCategoryKey,
} from './claude-config/ClaudeConfigDrawer';
import type { ClaudeConfigSnapshot } from '@nakiros/shared';

interface ClaudeConfigScreenProps {
  project: Project;
  /** Called when the user clicks the Skills card — should switch to the Skills tab. */
  onOpenSkillsTab(): void;
}

interface CategoryCardData {
  key: ClaudeConfigCategoryKey;
  icon: React.ReactNode;
  isGateway?: boolean;
  present: boolean;
  count: number | null;
}

/**
 * Configuration tab — read-only V1 explorer of a project's `.claude/`.
 * Header with completeness ring, grid of 9 category cards, drawer-based
 * drilldown per category, and a context-budget bar at the bottom.
 *
 * The Skills card is a gateway: clicking it switches to the dedicated Skills
 * tab rather than opening a drawer.
 */
export default function ClaudeConfigScreen({ project, onOpenSkillsTab }: ClaudeConfigScreenProps) {
  const { t } = useTranslation('claude-config');
  const { snapshot, loading, error, reload } = useClaudeConfig(project.id);
  const [drawer, setDrawer] = useState<ClaudeConfigCategoryKey | null>(null);

  if (loading) {
    return (
      <div className="grid flex-1 place-items-center text-n-muted">{t('loading')}</div>
    );
  }
  if (error || !snapshot) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="rounded-n-lg border border-n-border-default bg-n-surface px-8 py-7 text-center">
          <div className="text-[14px] font-medium text-n-fg">{t('errorTitle')}</div>
          {error && (
            <div className="mt-1 max-w-md font-n-mono text-[11.5px] text-n-muted">{error}</div>
          )}
          <button
            type="button"
            onClick={reload}
            className="mt-4 rounded-n-sm border border-n-border-default bg-n-raised px-3 py-1.5 font-n-mono text-[11.5px] text-n-fg hover:bg-n-canvas"
          >
            {t('errorRetry')}
          </button>
        </div>
      </div>
    );
  }

  const handleCardClick = (key: ClaudeConfigCategoryKey) => {
    if (key === 'skills') {
      onOpenSkillsTab();
      return;
    }
    setDrawer(key);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ConfigHeader snapshot={snapshot} />
      <div className="flex-1 overflow-auto px-7 pb-8 pt-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {buildCategoryCards(snapshot).map((card) => (
            <CategoryCard
              key={card.key}
              card={card}
              snapshot={snapshot}
              onClick={() => handleCardClick(card.key)}
            />
          ))}
        </div>
        <div className="mt-7">
          <SectionLabel>{t('claudeMdBody.intro')}</SectionLabel>
          <ContextBudgetBar snapshot={snapshot} />
        </div>
      </div>
      {drawer && (
        <ClaudeConfigDrawer
          categoryKey={drawer}
          snapshot={snapshot}
          projectId={project.id}
          onClose={() => setDrawer(null)}
          onOpenSkillsTab={onOpenSkillsTab}
        />
      )}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────
function ConfigHeader({ snapshot }: { snapshot: ClaudeConfigSnapshot }) {
  const { t } = useTranslation('claude-config');
  const { completeness, totalCategories, totalTokensInjected, path, scannedAt } = snapshot.summary;
  const pct = totalCategories === 0 ? 0 : (completeness / totalCategories) * 100;
  const dash = (pct / 100) * 163.4;
  const tokensFmt = formatNumber(totalTokensInjected);
  const lowPct = ((totalTokensInjected / 1_000_000) * 100).toFixed(1);
  const highPct = ((totalTokensInjected / 200_000) * 100).toFixed(1);

  return (
    <div className="border-b border-n-border-subtle px-7 pb-4 pt-6">
      <div className="flex items-start gap-5">
        <div className="relative h-16 w-16 flex-shrink-0">
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke="var(--color-n-border-subtle)"
              strokeWidth="5"
            />
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke="var(--color-n-accent-strong)"
              strokeWidth="5"
              strokeDasharray={`${dash} 163.4`}
              strokeLinecap="round"
              transform="rotate(-90 32 32)"
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-n-mono text-[15px] font-semibold text-n-fg">
            {completeness}
            <span className="text-n-subtle">/{totalCategories}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="m-0 text-[22px] font-semibold tracking-tight">{t('title')}</h1>
            <Badge tone="neutral">read-only · v1</Badge>
          </div>
          <div className="mt-1 text-[13px] text-n-muted">{t('subtitle')}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-n-muted">
            <span className="font-n-mono text-[11.5px] text-n-subtle truncate" title={path}>
              {path}
            </span>
            <span className="text-n-faint">·</span>
            <span>{t('scannedAt', { at: formatRelative(scannedAt) })}</span>
            <span className="text-n-faint">·</span>
            <span>
              {t('tokenInjectedHint', {
                tokens: tokensFmt,
                low: lowPct,
                high: highPct,
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────-
function CategoryCard({
  card,
  snapshot,
  onClick,
}: {
  card: CategoryCardData;
  snapshot: ClaudeConfigSnapshot;
  onClick(): void;
}) {
  const { t } = useTranslation('claude-config');
  const present = card.present;
  const label = t(`categories.${card.key}.label`);
  const blurb = t(`categories.${card.key}.blurb`);
  const countLabel = !present
    ? t('status.notConfigured')
    : card.count === null
      ? t('status.configured')
      : t(`categories.${card.key}.noun`, { count: card.count });

  const statusToneClass = !present
    ? 'bg-n-canvas text-n-muted'
    : (card.count ?? 1) === 0
      ? 'bg-n-canvas text-n-muted'
      : 'bg-n-accent-soft text-n-accent-strong';
  const statusLabel = !present
    ? t('status.notConfigured')
    : (card.count ?? 1) === 0
      ? t('status.empty')
      : t('status.configured');

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex flex-col items-stretch overflow-hidden rounded-n-lg border bg-n-surface text-left transition-colors hover:border-n-border-default ' +
        (present ? 'border-n-border-subtle' : 'border-dashed border-n-border-subtle opacity-80')
      }
    >
      <div className="flex flex-1 flex-col gap-2 px-4 pb-3 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={
                'flex h-7 w-7 items-center justify-center rounded-n-sm ' +
                (present
                  ? 'bg-n-accent-soft text-n-accent-strong'
                  : 'border border-dashed border-n-border-default text-n-subtle')
              }
            >
              {card.icon}
            </div>
            <div>
              <div className="text-[13.5px] font-semibold text-n-fg">{label}</div>
              <div className="mt-px font-n-mono text-[10.5px] text-n-subtle">{countLabel}</div>
            </div>
          </div>
          <span
            className={
              'inline-flex items-center gap-1.5 rounded-n-sm px-1.5 py-0.5 font-n-mono text-[10px] uppercase tracking-[0.8px] ' +
              statusToneClass
            }
          >
            {statusLabel}
          </span>
        </div>
        <div className="text-pretty text-[12px] leading-relaxed text-n-muted">{blurb}</div>
        {card.isGateway && (
          <div className="mt-1 inline-flex w-fit items-center gap-1 rounded-n-sm bg-n-accent-soft px-1.5 py-0.5 font-n-mono text-[10.5px] uppercase tracking-[0.8px] text-n-accent-strong">
            <ArrowUpRight size={11} strokeWidth={2.2} />
            {t('categories.skills.openInSkillsTab')}
          </div>
        )}
      </div>
      <CategoryPreviewRow snapshot={snapshot} categoryKey={card.key} />
    </button>
  );
}

// ── Preview row (one variant per category) ───────────────────────────────-
function CategoryPreviewRow({
  snapshot,
  categoryKey,
}: {
  snapshot: ClaudeConfigSnapshot;
  categoryKey: ClaudeConfigCategoryKey;
}) {
  const content = renderPreview(snapshot, categoryKey);
  if (!content) return null;
  return (
    <div className="flex min-h-[36px] flex-wrap items-center gap-1.5 border-t border-n-border-subtle bg-n-canvas px-4 py-2 text-[11px]">
      {content}
    </div>
  );
}

function renderPreview(
  snapshot: ClaudeConfigSnapshot,
  key: ClaudeConfigCategoryKey,
): React.ReactNode {
  switch (key) {
    case 'claudeMd': {
      const d = snapshot.claudeMd;
      if (!d.present) return null;
      return (
        <>
          <ChipMono>{formatNumber(d.tokens)} tok</ChipMono>
          <ChipMono>{d.headings.length} sections</ChipMono>
          {d.lastModified && (
            <span className="font-n-mono text-[10.5px] text-n-subtle">
              · {formatRelative(d.lastModified)}
            </span>
          )}
        </>
      );
    }
    case 'settings': {
      const s = snapshot.settings;
      if (!s.present) return null;
      const eff = s.effective;
      return (
        <>
          {eff.model.value && <ChipMono>{eff.model.value}</ChipMono>}
          <ChipMono>{eff.permissions.allowCount.value} allow</ChipMono>
          {eff.permissions.denyCount.value > 0 && (
            <ChipMono>{eff.permissions.denyCount.value} deny</ChipMono>
          )}
          {s.local.present && (
            <span className="inline-flex items-center rounded-n-sm bg-[oklch(0.78_0.10_240_/_0.18)] px-1.5 py-0.5 font-n-mono text-[10px] uppercase tracking-[0.7px] text-[oklch(0.40_0.10_240)]">
              local override
            </span>
          )}
        </>
      );
    }
    case 'rules': {
      const items = snapshot.rules.items;
      if (items.length === 0) return null;
      const samples = items.slice(0, 3);
      return (
        <>
          {samples.map((r) => (
            <ChipMono key={r.relativePath}>
              {r.paths[0] ?? r.name}
            </ChipMono>
          ))}
          {items.length > samples.length && (
            <span className="font-n-mono text-[10.5px] text-n-subtle">
              +{items.length - samples.length}
            </span>
          )}
        </>
      );
    }
    case 'skills':
      // Gateway — the in-card link already conveys the message.
      return null;
    case 'commands': {
      const items = snapshot.commands.items;
      if (items.length === 0) return null;
      const samples = items.slice(0, 4);
      return (
        <>
          {samples.map((c) => (
            <ChipMono key={c.relativePath}>/{c.name}</ChipMono>
          ))}
          {items.length > samples.length && (
            <span className="font-n-mono text-[10.5px] text-n-subtle">
              +{items.length - samples.length}
            </span>
          )}
        </>
      );
    }
    case 'outputStyles': {
      const items = snapshot.outputStyles.items;
      if (items.length === 0) return null;
      return items.slice(0, 3).map((s) => <ChipMono key={s.relativePath}>{s.name}</ChipMono>);
    }
    case 'agents': {
      const items = snapshot.agents.items;
      if (items.length === 0) return null;
      return items.map((a) => (
        <span
          key={a.relativePath}
          className="inline-flex items-center rounded-n-sm bg-[oklch(0.80_0.13_295_/_0.15)] px-1.5 py-0.5 font-n-mono text-[10.5px] text-[oklch(0.42_0.13_295)]"
        >
          {a.name}
        </span>
      ));
    }
    case 'mcp': {
      const items = snapshot.mcp.items;
      if (items.length === 0) return null;
      return items.map((m) => <ChipMono key={m.name}>{m.name}</ChipMono>);
    }
    case 'hooks': {
      const active = snapshot.hooks.events.filter((e) => e.items.length > 0);
      if (active.length === 0) return null;
      return active.map((e) => (
        <span
          key={e.event}
          className="inline-flex items-center rounded-n-sm bg-n-accent-soft px-1.5 py-0.5 font-n-mono text-[10.5px] text-n-accent-strong"
        >
          {e.event} ×{e.items.length}
        </span>
      ));
    }
  }
}

function ChipMono({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-n-sm border border-n-border-subtle bg-n-surface px-1.5 py-0.5 font-n-mono text-[10.5px] text-n-muted">
      {children}
    </span>
  );
}

function buildCategoryCards(snapshot: ClaudeConfigSnapshot): CategoryCardData[] {
  return [
    {
      key: 'claudeMd',
      icon: <FileText size={15} strokeWidth={2} />,
      present: snapshot.claudeMd.present,
      count: snapshot.claudeMd.present ? 1 : 0,
    },
    {
      key: 'settings',
      icon: <Cog size={15} strokeWidth={2} />,
      present: snapshot.settings.present,
      count: snapshot.settings.effective.permissions.allowCount.value
        + snapshot.settings.effective.permissions.denyCount.value
        + snapshot.settings.effective.envCount.value
        + snapshot.settings.effective.hookCount.value,
    },
    {
      key: 'rules',
      icon: <Layers size={15} strokeWidth={2} />,
      present: snapshot.rules.present,
      count: snapshot.rules.count,
    },
    {
      key: 'skills',
      icon: <Sparkles size={15} strokeWidth={2} />,
      isGateway: true,
      present: snapshot.skills.present,
      count: snapshot.skills.count,
    },
    {
      key: 'commands',
      icon: <Terminal size={15} strokeWidth={2} />,
      present: snapshot.commands.present,
      count: snapshot.commands.count,
    },
    {
      key: 'outputStyles',
      icon: <Sliders size={15} strokeWidth={2} />,
      present: snapshot.outputStyles.present,
      count: snapshot.outputStyles.count,
    },
    {
      key: 'agents',
      icon: <Bot size={15} strokeWidth={2} />,
      present: snapshot.agents.present,
      count: snapshot.agents.count,
    },
    {
      key: 'mcp',
      icon: <Plug size={15} strokeWidth={2} />,
      present: snapshot.mcp.present,
      count: snapshot.mcp.count,
    },
    {
      key: 'hooks',
      icon: <Zap size={15} strokeWidth={2} />,
      present: snapshot.hooks.present,
      count: snapshot.hooks.count,
    },
  ];
}

// ── Context budget bar ───────────────────────────────────────────────────-
function ContextBudgetBar({ snapshot }: { snapshot: ClaudeConfigSnapshot }) {
  const { t } = useTranslation('claude-config');
  const claudeMdTokens = snapshot.claudeMd.tokens;
  const alwaysOnRulesTokens = useMemo(
    () =>
      snapshot.rules.items
        .filter((r) => r.paths.length === 0)
        .reduce((s, r) => s + r.tokens, 0),
    [snapshot.rules.items],
  );
  const total = claudeMdTokens + alwaysOnRulesTokens;
  const segments = [
    { label: 'CLAUDE.md', tokens: claudeMdTokens, color: 'bg-[oklch(0.78_0.10_195)]' },
    { label: 'Always-on rules', tokens: alwaysOnRulesTokens, color: 'bg-[oklch(0.78_0.13_295)]' },
  ];

  return (
    <div className="rounded-n-lg border border-n-border-subtle bg-n-surface px-5 py-4">
      <div className="mb-2.5 flex items-baseline justify-between">
        <div>
          <div className="font-n-mono text-[22px] font-semibold text-n-fg">
            {formatNumber(total)}
          </div>
          <div className="text-[11.5px] text-n-muted">
            {t('tokenInjectedHint', {
              tokens: formatNumber(total),
              low: ((total / 1_000_000) * 100).toFixed(1),
              high: ((total / 200_000) * 100).toFixed(1),
            })}
          </div>
        </div>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-n-sm border border-n-border-subtle bg-n-canvas">
        {segments.map((s) =>
          s.tokens > 0 ? (
            <div
              key={s.label}
              title={`${s.label}: ${formatNumber(s.tokens)} tok`}
              className={s.color}
              style={{ width: `${total === 0 ? 0 : (s.tokens / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-3.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 flex-shrink-0 rounded-[2px] ${s.color}`} />
            <span className="text-[11.5px] text-n-muted">{s.label}</span>
            <span className="font-n-mono text-[11px] text-n-subtle">{formatNumber(s.tokens)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── tiny visual helpers (local to this screen) ───────────────────────────-
function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent';
}) {
  const cls =
    tone === 'accent'
      ? 'bg-n-accent-soft text-n-accent-strong'
      : 'bg-n-canvas text-n-muted border border-n-border-subtle';
  return (
    <span
      className={
        'inline-flex items-center rounded-n-sm px-1.5 py-0.5 font-n-mono text-[10px] uppercase tracking-[0.6px] ' +
        cls
      }
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
      {children}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.round(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)} h ago`;
  return new Date(iso).toLocaleString();
}

// Re-export the icon used in the gateway link so the drawer can mirror it.
export { ArrowUpRight as GatewayIcon };
