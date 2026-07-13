import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import type {
  AgentProvider,
  CodexConversationAnalysis,
  ConversationAnalysis,
  Project,
} from '@nakiros/shared';
import {
  isCodexConversationAnalysis,
  isClaudeConversationAnalysis,
  useArgosConversationDashboard,
} from '../../hooks/useConversationAnalyses';
import { ConversationRow } from './ConvRow';
import { ConversationDrawer } from './ConvDrawer';
import { AgentComparisonPanel } from './AgentComparisonPanel';

interface Props {
  /** Project whose JSONL conversation analyses are shown. */
  project: Project;
}

type FilterKey =
  | 'all'
  | 'critical'
  | 'compactions'
  | 'friction'
  | 'cacheWaste'
  | 'toolErrors';

interface FilterDef {
  id: FilterKey;
  matchClaude(a: ConversationAnalysis): boolean;
  matchCodex(a: CodexConversationAnalysis): boolean;
}

type ProviderFilter = 'all' | AgentProvider;
type ConversationListEntry =
  | { kind: 'claude'; conversation: ConversationAnalysis }
  | { kind: 'codex'; conversation: CodexConversationAnalysis };

const FILTERS: FilterDef[] = [
  { id: 'all', matchClaude: () => true, matchCodex: () => true },
  {
    id: 'critical',
    matchClaude: (a) => a.healthZone === 'degraded' || a.score <= 40,
    matchCodex: (a) => a.healthZone === 'degraded' || a.score <= 40,
  },
  {
    id: 'compactions',
    matchClaude: (a) => a.compactions.length > 0,
    matchCodex: (a) => a.compactions.length > 0,
  },
  {
    id: 'friction',
    matchClaude: (a) => a.frictionPoints.length > 0,
    matchCodex: (a) => a.frictionPoints.length > 0,
  },
  {
    id: 'cacheWaste',
    matchClaude: (a) => a.cacheMissTurns >= 3,
    matchCodex: () => false,
  },
  {
    id: 'toolErrors',
    matchClaude: (a) => a.toolErrorCount > 0,
    matchCodex: (a) => a.toolErrorCount > 0,
  },
];

/**
 * Phase 5 PR10a port of the Conversations screen. Replaces the legacy
 * `ConversationsView` for the new shell only — the old shell still routes
 * to the previous screen until Phase 7 cleanup.
 *
 * Reads the per-project analyses through {@link useConversationAnalyses}
 * (channel `project:listConversationsWithAnalysis`) and renders them as
 * health-first rows. Clicking a row opens the {@link ConvDrawer} with
 * Diagnostic and Timeline tabs.
 */
export default function ConversationsScreen({ project }: Props) {
  const { t } = useTranslation('conversations');
  const dashboard = useArgosConversationDashboard(project.id);
  const analyses = dashboard?.analyses ?? [];
  const loading = dashboard === null;

  const [filter, setFilter] = useState<FilterKey>('all');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [showSynthetic, setShowSynthetic] = useState(false);
  const [open, setOpen] = useState<ConversationListEntry['conversation'] | null>(null);

  const claudeAnalyses = useMemo(
    () => analyses.filter(isClaudeConversationAnalysis),
    [analyses],
  );
  const codexAnalyses = useMemo(
    () => analyses.filter(isCodexConversationAnalysis),
    [analyses],
  );

  // Hide synthetic conversations (sandbox / fix-temp / eval-iteration runs)
  // by default — they're tagged at ingest time and almost never relevant
  // when the user is reviewing their actual coding sessions.
  const userScopedAnalyses = useMemo(
    () => (showSynthetic ? claudeAnalyses : claudeAnalyses.filter((a) => a.kind !== 'synthetic')),
    [claudeAnalyses, showSynthetic],
  );

  const syntheticCount = useMemo(
    () => claudeAnalyses.filter((a) => a.kind === 'synthetic').length,
    [claudeAnalyses],
  );

  const providerFilteredAnalyses = useMemo(
    () => providerFilter === 'all' || providerFilter === 'claude' ? userScopedAnalyses : [],
    [providerFilter, userScopedAnalyses],
  );
  const providerFilteredCodex = useMemo(
    () => providerFilter === 'all' || providerFilter === 'codex' ? codexAnalyses : [],
    [codexAnalyses, providerFilter],
  );

  const providers = useMemo(() => {
    const found = new Set<AgentProvider>();
    if (userScopedAnalyses.length > 0) found.add('claude');
    if (codexAnalyses.length > 0) found.add('codex');
    return [...found];
  }, [codexAnalyses.length, userScopedAnalyses.length]);

  const counts = useMemo(() => {
    const out: Record<FilterKey, number> = {
      all: 0,
      critical: 0,
      compactions: 0,
      friction: 0,
      cacheWaste: 0,
      toolErrors: 0,
    };
    for (const f of FILTERS) {
      out[f.id] = providerFilteredAnalyses.filter(f.matchClaude).length
        + providerFilteredCodex.filter(f.matchCodex).length;
    }
    return out;
  }, [providerFilteredAnalyses, providerFilteredCodex]);

  const visible = useMemo(() => {
    const matcher = FILTERS.find((f) => f.id === filter)!;
    const analyzed: ConversationListEntry[] = providerFilteredAnalyses
      .filter(matcher.matchClaude)
      .map((conversation) => ({ kind: 'claude', conversation }));
    const native: ConversationListEntry[] = providerFilteredCodex
      .filter(matcher.matchCodex)
      .map((conversation) => ({ kind: 'codex', conversation }));
    return [...analyzed, ...native].sort((a, b) =>
      new Date(b.conversation.lastMessageAt).getTime()
      - new Date(a.conversation.lastMessageAt).getTime(),
    );
  }, [filter, providerFilteredAnalyses, providerFilteredCodex]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 font-n-mono text-[12px] text-n-muted">
        <RefreshCw size={12} className="animate-spin" />
        {t('loading')}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-n-canvas">
      <header className="flex items-start justify-between gap-6 border-b border-n-border-subtle px-7 py-4">
        <div>
          <h2 className="text-[15px] font-medium text-n-fg">
            {t('headingAll', { count: analyses.length })}
          </h2>
          <p className="mt-1 font-n-mono text-[11px] text-n-subtle">
            {t('subheadingRecent')}
          </p>
        </div>
      </header>

      {dashboard && <AgentComparisonPanel comparison={dashboard.comparison} />}

      <div className="flex flex-wrap items-center gap-1.5 border-b border-n-border-subtle bg-n-sunken px-7 py-2.5">
        {providers.length > 1 && (
          <div className="mr-2 inline-flex items-center gap-0.5 rounded-n-xs border border-n-border-subtle bg-n-canvas p-0.5" aria-label={t('providerFilter.label')}>
            {(['all', ...providers] as ProviderFilter[]).map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => setProviderFilter(provider)}
                aria-pressed={providerFilter === provider}
                className={'rounded-[3px] px-2 py-0.5 font-n-mono text-[10.5px] transition-colors ' +
                  (providerFilter === provider
                    ? 'bg-n-raised text-n-fg'
                    : 'text-n-subtle hover:text-n-fg')}
              >
                {t(`providerFilter.${provider}`)}
              </button>
            ))}
          </div>
        )}
        {FILTERS.map((f) => {
          const active = f.id === filter;
          const count = counts[f.id];
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={
                'inline-flex items-center gap-1.5 rounded-n-xs border px-2.5 py-1 text-[11.5px] transition-colors ' +
                (active
                  ? 'border-n-accent-line bg-n-accent-soft text-n-accent-strong'
                  : 'border-n-border-subtle bg-n-raised text-n-muted hover:text-n-fg')
              }
            >
              <span>{t(`filter.${f.id}`)}</span>
              <span
                className={
                  'font-n-mono text-[10.5px] tabular-nums ' +
                  (active ? 'text-n-accent-strong' : 'text-n-faint')
                }
              >
                {count}
              </span>
            </button>
          );
        })}
        {syntheticCount > 0 && (
          <label
            className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11.5px] text-n-muted"
            title={t('showSyntheticTitle')}
          >
            <input
              type="checkbox"
              checked={showSynthetic}
              onChange={() => setShowSynthetic((v) => !v)}
              className="h-3 w-3 cursor-pointer accent-n-accent-strong"
            />
            <span>{t('showSynthetic', { count: syntheticCount })}</span>
          </label>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-7 py-6">
            <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface px-4 py-10 text-center font-n-mono text-[12px] text-n-faint">
              {analyses.length === 0 ? t('empty') : t('emptyForFilter')}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col">
            {visible.map((entry) => (
              <li key={`${entry.kind}:${entry.conversation.sessionId}`}>
                <ConversationRow analysis={entry.conversation} onOpen={() => setOpen(entry.conversation)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && (
        <ConversationDrawer
          projectId={project.id}
          analysis={open}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
