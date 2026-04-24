import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, RefreshCcw, Loader2 } from 'lucide-react';
import type {
  ConversationAnalysis,
  ConversationDeepAnalysis,
  DeepAnalysisEvent,
  Project,
} from '@nakiros/shared';
import { MarkdownViewer } from '../ui/MarkdownViewer';

interface Props {
  project: Project;
  analysis: ConversationAnalysis;
}

interface LiveState {
  /** Assistant text accumulated so far (raw, still may contain the JSON tail). */
  text: string;
  /** Tool use lines the assistant has emitted (unexpected for analyzer, kept for symmetry). */
  tools: { name: string; display: string }[];
  /** Running token count from the `tokens` event. */
  tokensUsed: number;
  /** Wall-clock elapsed since the `started` event, ms. */
  elapsedMs: number;
  model: 'haiku' | 'sonnet' | null;
}

const EMPTY_LIVE: LiveState = { text: '', tools: [], tokensUsed: 0, elapsedMs: 0, model: null };

/**
 * Deep (LLM-powered) analysis section of the diagnostic panel.
 * - Eagerly checks if a cached report exists on mount
 * - Offers a one-click run when absent
 * - Streams the assistant's output live during the run via `deepAnalysis:event`
 */
export function ConversationDeepAnalysisSection({ project, analysis }: Props) {
  const { t } = useTranslation('conversations');
  const [cached, setCached] = useState<ConversationDeepAnalysis | null>(null);
  const [checking, setChecking] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState>(EMPTY_LIVE);
  const startedAtRef = useRef<number | null>(null);

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

  // Subscribe to streaming events for THIS conversation. Multiple analyses
  // can run in parallel on different sessions, so we filter by sessionId.
  useEffect(() => {
    const unsubscribe = window.nakiros.onDeepAnalysisEvent((event: DeepAnalysisEvent) => {
      if (event.sessionId !== analysis.sessionId) return;
      switch (event.type) {
        case 'started':
          startedAtRef.current = Date.now();
          setLive({ ...EMPTY_LIVE, model: event.model });
          break;
        case 'text':
          setLive((prev) => ({ ...prev, text: prev.text + event.text }));
          break;
        case 'tool':
          setLive((prev) => ({
            ...prev,
            tools: [...prev.tools, { name: event.name, display: event.display }],
          }));
          break;
        case 'tokens':
          setLive((prev) => ({ ...prev, tokensUsed: event.tokensUsed }));
          break;
        case 'done':
          setLive((prev) => ({
            ...prev,
            tokensUsed: event.tokensUsed,
            elapsedMs: event.durationMs,
          }));
          break;
        case 'error':
          // The catch in run() also surfaces this via `setError`; we just
          // stop animating the elapsed counter here.
          break;
      }
    });
    return unsubscribe;
  }, [analysis.sessionId]);

  // While running, tick the elapsed counter from the `started` event.
  useEffect(() => {
    if (!running || startedAtRef.current === null) return;
    const id = window.setInterval(() => {
      if (startedAtRef.current === null) return;
      setLive((prev) => ({ ...prev, elapsedMs: Date.now() - startedAtRef.current! }));
    }, 500);
    return () => window.clearInterval(id);
  }, [running]);

  async function run() {
    setRunning(true);
    setError(null);
    setLive(EMPTY_LIVE);
    startedAtRef.current = null;
    try {
      const r = await window.nakiros.deepAnalyzeConversation(project.id, analysis.sessionId);
      setCached(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
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

  // ── Running OR no cache yet: show pitch + optional live pane ──────────────
  if (running || !cached) {
    return (
      <section className="rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] p-3">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={14} className="text-[var(--primary)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
            {t('deepAnalysis.title')}
          </h3>
        </div>
        {!running && (
          <>
            <p className="mb-2 text-xs text-[var(--text-primary)]">
              {t('deepAnalysis.pitch')}
            </p>
            <div className="mb-3 text-[11px] text-[var(--text-muted)]">
              {t('deepAnalysis.estimate', {
                model: predictedModel,
                tokensK: estimatedInputK,
              })}
            </div>
          </>
        )}
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 rounded border border-[var(--primary)] bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed"
        >
          {running ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              {t('deepAnalysis.running')}
            </>
          ) : (
            t('deepAnalysis.run')
          )}
        </button>
        {running && (
          <LiveAnalysisPane live={live} hintText={t('deepAnalysis.runningHint')} />
        )}
        {error && (
          <div className="mt-2 text-xs text-[var(--danger)] whitespace-pre-wrap">{error}</div>
        )}
      </section>
    );
  }

  // ── Cached report ─────────────────────────────────────────────────────────
  return (
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
            onClick={run}
            disabled={running}
            className="flex items-center gap-1 rounded border border-[var(--line)] px-2 py-0.5 hover:border-[var(--primary)] disabled:cursor-not-allowed"
            title={t('deepAnalysis.rerun')}
          >
            <RefreshCcw size={10} />
            {t('deepAnalysis.rerun')}
          </button>
        </div>
      </div>
      <div className="max-h-[50vh] overflow-y-auto rounded border border-[var(--line)] bg-[var(--bg-soft)] p-3">
        <MarkdownViewer content={cached.report} />
      </div>
      {error && <div className="mt-2 text-xs text-[var(--danger)] whitespace-pre-wrap">{error}</div>}
    </section>
  );
}

/**
 * Live pane rendered during an in-flight analysis. Shows:
 *  - header with model + elapsed time + running token count
 *  - text that streams in (rendered as markdown — the report builds itself
 *    as the assistant writes it)
 *  - optional tool lines (not expected for the analyzer, but forwarded for
 *    symmetry with audit/fix runs in case we reuse this pane elsewhere)
 */
function LiveAnalysisPane({ live, hintText }: { live: LiveState; hintText: string }) {
  const elapsed = formatElapsed(live.elapsedMs);
  return (
    <div className="mt-3 rounded border border-[var(--line)] bg-[var(--bg-card)] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[10px] text-[var(--text-muted)]">
        <Loader2 size={10} className="animate-spin text-[var(--primary)]" />
        {live.model && (
          <span>
            model: <span className="font-mono text-[var(--text-primary)]">{live.model}</span>
          </span>
        )}
        <span>
          elapsed: <span className="font-mono text-[var(--text-primary)]">{elapsed}</span>
        </span>
        <span>
          tokens: <span className="font-mono text-[var(--text-primary)]">{live.tokensUsed}</span>
        </span>
      </div>

      {live.tools.length > 0 && (
        <ul className="mb-2 flex flex-col gap-0.5 text-xs font-mono">
          {live.tools.map((tool, i) => (
            <li key={`${tool.name}-${i}`} className="flex items-start gap-2">
              <span className="shrink-0 rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--primary)]">
                {tool.name}
              </span>
              <span className="truncate text-[var(--text-muted)]">{tool.display}</span>
            </li>
          ))}
        </ul>
      )}

      {live.text ? (
        <div className="max-h-[40vh] overflow-y-auto rounded border border-[var(--line)] bg-[var(--bg-soft)] p-3">
          <MarkdownViewer content={live.text} />
        </div>
      ) : (
        <div className="text-[11px] italic text-[var(--text-muted)]">{hintText}</div>
      )}
    </div>
  );
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m${String(sec).padStart(2, '0')}s`;
}
