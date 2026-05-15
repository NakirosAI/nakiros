import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecommendationPattern, RecoCard as RecoCardType } from '@nakiros/shared';
import { RecoCard } from './RecoCard';

interface Props {
  projectId: string;
  pattern: RecommendationPattern;
  /** Called when the user applies a reco card — opens the downstream fix/edit/create run tab. */
  onRunOpen(runId: string): void;
  /** Called when the user clicks Analyser — opens the recommendation-analyze run tab. */
  onAnalyzeRunOpen(runId: string): void;
  onPatternsRefresh(): void;
}

/**
 * Right-side detail panel for a selected pattern: header summary (severity /
 * zones / files / signals), Analyze button (idle → running → done / failed),
 * list of {@link RecoCard} items, and a "Show dismissed" toggle.
 *
 * Subscribes to `recommendations:event` so the run status and reco list
 * live-update while the analyser is running.
 */
export function PatternDetail({ projectId, pattern, onRunOpen, onAnalyzeRunOpen, onPatternsRefresh }: Props) {
  const { t } = useTranslation('recommendations');
  const [recos, setRecos] = useState<RecoCardType[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);

  // Load recos whenever the pattern changes.
  useEffect(() => {
    let cancelled = false;
    void window.nakiros
      .getRecommendationPattern(projectId, pattern.id)
      .then(({ recos: loaded }) => {
        if (!cancelled) setRecos(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, pattern.id]);

  // Live-update via the recommendations:event channel — re-fetch when the
  // analyser run finishes (event.type === 'done').
  useEffect(() => {
    const off = window.nakiros.onRecommendationsEvent((ev) => {
      if (ev.event.type === 'done') {
        void window.nakiros
          .getRecommendationPattern(projectId, pattern.id)
          .then(({ recos: loaded }) => setRecos(loaded));
        onPatternsRefresh();
      }
    });
    return () => off();
  }, [projectId, pattern.id, onPatternsRefresh]);

  const visible = useMemo(
    () => recos.filter((r) => showDismissed || r.status !== 'dismissed'),
    [recos, showDismissed],
  );
  const dismissedCount = recos.filter((r) => r.status === 'dismissed').length;

  const handleAnalyze = async () => {
    const { runId } = await window.nakiros.analyzeRecommendationPattern({ projectId, patternId: pattern.id });
    onAnalyzeRunOpen(runId);
    onPatternsRefresh();
  };

  const handleApply = async (recId: string, editedBrief: string) => {
    const res = await window.nakiros.applyReco(projectId, pattern.id, recId, editedBrief);
    if (res.ok) {
      onRunOpen(res.runId);
      const { recos: loaded } = await window.nakiros.getRecommendationPattern(projectId, pattern.id);
      setRecos(loaded);
    } else {
      const errKey =
        res.error === 'target-missing'
          ? 'targetMissing'
          : res.error === 'unknown-artifact-type'
            ? 'unknownArtifactType'
            : 'recoNotFound';
      // For v1, surface via alert. A toast system can replace this later.
      window.alert(t(`errors.${errKey}`));
    }
  };

  const handleDismiss = async (recId: string) => {
    await window.nakiros.dismissReco(projectId, pattern.id, recId);
    const { recos: loaded } = await window.nakiros.getRecommendationPattern(projectId, pattern.id);
    setRecos(loaded);
  };

  const isRunning = pattern.analysis.status === 'running';
  const isDone = pattern.analysis.status === 'done';

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-n-border-subtle">
        {/* Title row + Analyze button */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-base font-n-sans text-n-fg break-words leading-snug min-w-0">
            {pattern.signature.topTokens.slice(0, 6).join(' · ')}
          </h2>
          <button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={isRunning}
            className="flex-shrink-0 text-sm px-3 py-1.5 rounded bg-n-accent-soft text-n-accent border border-n-accent-line hover:bg-n-accent-line hover:text-n-canvas disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isDone ? t('reanalyze') : t('analyze')}
          </button>
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2 text-xs text-n-muted">
          <SeverityChip severity={pattern.severity} />
          <span className="font-n-mono">{pattern.zoneCount} zones</span>
          <span className="font-n-mono">{pattern.signature.filesTouched.length} files</span>
          {pattern.signature.signalKinds.length > 0 && (
            <span className="font-n-mono">
              signals: {pattern.signature.signalKinds.join(', ')}
            </span>
          )}
        </div>
      </header>

      {/* Body — reco cards */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {/* Status banners */}
        {isRunning && (
          <div className="mb-4 text-sm text-n-accent bg-n-accent-soft border border-n-accent-line rounded px-3 py-2">
            {t('running')}
          </div>
        )}
        {pattern.analysis.status === 'failed' && (
          <div className="mb-4 text-sm text-n-critical bg-n-critical-soft border border-n-critical rounded px-3 py-2">
            {t('failed')}
          </div>
        )}
        {isDone && recos.length === 0 && (
          <p className="text-sm text-n-muted">{t('noRecosProduced')}</p>
        )}

        {/* Cards */}
        {visible.map((r) => (
          <RecoCard
            key={r.recId}
            card={r}
            onApply={(brief) => void handleApply(r.recId, brief)}
            onDismiss={() => void handleDismiss(r.recId)}
            onOpenRun={(runId) => onRunOpen(runId)}
          />
        ))}

        {/* Dismissed toggle */}
        {!showDismissed && dismissedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowDismissed(true)}
            className="text-xs text-n-muted underline underline-offset-2 mt-2 hover:text-n-fg transition-colors"
          >
            {t('card.showDismissed', { count: dismissedCount })}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function SeverityChip({ severity }: { severity: RecommendationPattern['severity'] }) {
  const classes =
    severity === 'high'
      ? 'bg-n-critical-soft text-n-critical'
      : 'bg-n-watch-soft text-n-watch';

  return (
    <span
      className={[
        'inline-flex items-center rounded-n-xs px-1.5 py-0.5',
        'font-n-mono text-[10px] uppercase tracking-wider',
        classes,
      ].join(' ')}
    >
      {severity}
    </span>
  );
}
