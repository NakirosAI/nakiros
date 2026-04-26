import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, RefreshCcw, Loader2 } from 'lucide-react';
import type {
  AnalyzeConvoRun,
  ConversationAnalysis,
  ConversationDeepAnalysis,
  Project,
} from '@nakiros/shared';
import { MarkdownViewer } from '../ui/MarkdownViewer';
import AnalyzeConvoView from '../../views/AnalyzeConvoView';

interface Props {
  project: Project;
  analysis: ConversationAnalysis;
}

/**
 * Deep (LLM-powered) analysis section of the diagnostic panel.
 * - Eagerly checks if a cached report exists on mount
 * - Offers a one-click run when absent — starts a streaming `analyze-convo`
 *   Run kind and opens `AnalyzeConvoView` so the user sees the analysis
 *   live and can pivot it mid-flight (no more opaque "wait 90 s" blob).
 * - Picks model/cost transparently so the user knows what they're paying.
 */
export function ConversationDeepAnalysisSection({ project, analysis }: Props) {
  const { t } = useTranslation('conversations');
  const [cached, setCached] = useState<ConversationDeepAnalysis | null>(null);
  const [checking, setChecking] = useState(true);
  const [activeRun, setActiveRun] = useState<AnalyzeConvoRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setChecking(true);
    window.nakiros
      .loadConversationDeepAnalysis(project.id, analysis.sessionId)
      .then((r) => {
        if (!alive) return;
        setCached(r);
        setChecking(false);
      })
      .catch(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [project.id, analysis.sessionId]);

  async function startAnalysis() {
    setStarting(true);
    setError(null);
    try {
      const run = await window.nakiros.startAnalyzeConvo({
        projectId: project.id,
        sessionId: analysis.sessionId,
      });
      setActiveRun(run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  // When the AnalyzeConvoView closes (run finished or user dismissed), refresh
  // the cache so the section flips into "show cached report" mode.
  function handleViewClose() {
    setActiveRun(null);
    void window.nakiros
      .loadConversationDeepAnalysis(project.id, analysis.sessionId)
      .then((r) => {
        if (r) setCached(r);
      });
  }

  // Pre-run estimate so the user knows roughly what they're about to spend.
  // Uses stage-1 context stats — the real estimate comes from the daemon.
  const estimatedInputK = Math.round(analysis.maxContextTokens / 1000);
  const predictedModel: 'haiku' | 'sonnet' =
    analysis.maxContextTokens <= 170_000 ? 'haiku' : 'sonnet';

  if (checking) {
    return (
      <section className="rounded-lg border border-[var(--line)] bg-[var(--bg-soft)] p-3 text-xs text-[var(--text-muted)]">
        {t('deepAnalysis.checking')}
      </section>
    );
  }

  if (!cached) {
    return (
      <>
        <section className="rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] p-3">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--primary)]" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
              {t('deepAnalysis.title')}
            </h3>
          </div>
          <p className="mb-2 text-xs text-[var(--text-primary)]">
            {t('deepAnalysis.pitch')}
          </p>
          <div className="mb-3 text-[11px] text-[var(--text-muted)]">
            {t('deepAnalysis.estimate', {
              model: predictedModel,
              tokensK: estimatedInputK,
            })}
          </div>
          <button
            type="button"
            onClick={startAnalysis}
            disabled={starting}
            className="inline-flex items-center gap-2 rounded border border-[var(--primary)] bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed"
          >
            {starting ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                {t('deepAnalysis.running')}
              </>
            ) : (
              t('deepAnalysis.run')
            )}
          </button>
          {error && (
            <div className="mt-2 text-xs text-[var(--danger)]">{error}</div>
          )}
        </section>
        {activeRun && <AnalyzeConvoView initialRun={activeRun} onClose={handleViewClose} />}
      </>
    );
  }

  return (
    <>
      <section className="rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--primary)]" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t('deepAnalysis.title')}
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
            <span>
              {t('deepAnalysis.generated', {
                model: cached.model,
                tokensK: Math.round(cached.inputTokens / 1000),
                date: new Date(cached.generatedAt).toLocaleString(),
              })}
            </span>
            <button
              type="button"
              onClick={startAnalysis}
              disabled={starting}
              className="flex items-center gap-1 rounded border border-[var(--line)] px-2 py-0.5 hover:border-[var(--primary)] disabled:cursor-not-allowed"
              title={t('deepAnalysis.rerun')}
            >
              {starting ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <RefreshCcw size={10} />
              )}
              {starting ? t('deepAnalysis.running') : t('deepAnalysis.rerun')}
            </button>
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto rounded border border-[var(--line)] bg-[var(--bg-soft)] p-3">
          <MarkdownViewer content={cached.report} />
        </div>
        {error && <div className="mt-2 text-xs text-[var(--danger)]">{error}</div>}
      </section>
      {activeRun && <AnalyzeConvoView initialRun={activeRun} onClose={handleViewClose} />}
    </>
  );
}
