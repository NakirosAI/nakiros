import { useCallback, useEffect, useState } from 'react';
import { Play, RefreshCw, RotateCcw, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  AnalyzeConvoRun,
  ConversationDeepAnalysis,
  ProviderConversationAnalysis,
} from '@nakiros/shared';

import AuditMarkdownViewer from '../skill/AuditMarkdownViewer';
import { isCodexConversationAnalysis } from '../../hooks/useConversationAnalyses';

interface Props {
  projectId: string;
  analysis: ProviderConversationAnalysis;
}

/** Provider-matched narrative analysis: Claude sessions use Claude, Codex sessions use Codex. */
export function ConversationDeepAnalysisSection({ projectId, analysis }: Props) {
  const { t } = useTranslation('conversations');
  const analyzerProvider = isCodexConversationAnalysis(analysis) ? 'codex' : 'claude';
  const [report, setReport] = useState<ConversationDeepAnalysis | null>(null);
  const [run, setRun] = useState<AnalyzeConvoRun | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    const cached = await window.nakiros.loadConversationDeepAnalysis(projectId, analysis.sessionId);
    setReport(cached);
    return cached;
  }, [analysis.sessionId, projectId]);

  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    setError(null);
    void loadReport()
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [loadReport]);

  useEffect(() => {
    if (!run || !['starting', 'running', 'waiting_for_input'].includes(run.status)) return;
    const timer = window.setInterval(() => {
      void window.nakiros.getAnalyzeConvoRun(run.runId)
        .then(async (next) => {
          if (!next) return;
          setRun(next);
          if (next.status === 'completed') {
            try {
              await loadReport();
            } finally {
              await window.nakiros.finishAnalyzeConvo(next.runId);
            }
          } else if (next.status === 'failed') {
            setError(next.error ?? t('deepAnalysis.failed'));
          }
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : String(cause));
        });
    }, 600);
    return () => window.clearInterval(timer);
  }, [loadReport, run, t]);

  async function start(): Promise<void> {
    setError(null);
    try {
      const next = await window.nakiros.startAnalyzeConvo({
        projectId,
        sessionId: analysis.sessionId,
        analyzerProvider,
      });
      setRun(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function stop(): Promise<void> {
    if (!run) return;
    try {
      await window.nakiros.stopAnalyzeConvo(run.runId);
      setRun({ ...run, status: 'stopped' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const active = run && ['starting', 'running', 'waiting_for_input'].includes(run.status);

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-faint">
            {t('deepAnalysis.title')}
          </div>
          <div className="mt-1 font-n-mono text-[10.5px] text-n-subtle">
            {t('deepAnalysis.analyzer', { provider: t(`providerFilter.${analyzerProvider}`) })}
          </div>
        </div>
        {!checking && (
          active ? (
            <button
              type="button"
              onClick={() => void stop()}
              className="inline-flex items-center gap-1.5 rounded-n-sm border border-n-border-default bg-n-raised px-2.5 py-1.5 text-[11.5px] text-n-muted hover:text-n-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-n-accent"
            >
              <Square size={11} /> {t('deepAnalysis.stop')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void start()}
              className="inline-flex items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-2.5 py-1.5 text-[11.5px] text-n-accent-strong hover:bg-n-accent-soft/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-n-accent"
            >
              {report ? <RotateCcw size={12} /> : <Play size={12} />}
              {report ? t('deepAnalysis.rerun') : t('deepAnalysis.run')}
            </button>
          )
        )}
      </div>

      <div className="mt-2 border-y border-n-border-subtle bg-n-surface px-4 py-3">
        {checking ? (
          <div className="flex items-center gap-2 font-n-mono text-[11px] text-n-muted">
            <RefreshCw size={12} className="animate-spin" /> {t('deepAnalysis.checking')}
          </div>
        ) : active ? (
          <div className="flex items-start gap-2">
            <RefreshCw size={13} className="mt-0.5 animate-spin text-n-accent" />
            <div>
              <div className="text-[12.5px] text-n-fg">{t('deepAnalysis.running')}</div>
              <div className="mt-0.5 text-[11.5px] text-n-muted">
                {t('deepAnalysis.runningHintProvider', { provider: t(`providerFilter.${analyzerProvider}`) })}
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="text-[12px] text-n-critical">{error}</div>
        ) : report ? (
          <div>
            <div className="mb-3 font-n-mono text-[10.5px] text-n-subtle">
              {t('deepAnalysis.generatedBy', {
                provider: t(`providerFilter.${report.analyzerProvider}`),
                model: report.model,
                date: new Date(report.generatedAt).toLocaleString(),
              })}
            </div>
            <AuditMarkdownViewer content={report.report} />
          </div>
        ) : (
          <p className="max-w-[70ch] text-[12.5px] leading-relaxed text-n-muted">
            {t('deepAnalysis.pitchProvider', { provider: t(`providerFilter.${analyzerProvider}`) })}
          </p>
        )}
      </div>
    </section>
  );
}
