import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ConversationAnalysis,
  ConversationMessage,
  ConversationTip,
  Project,
} from '@nakiros/shared';
import { Lightbulb, AlertTriangle, AlertCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { ConversationTimeline } from './ConversationTimeline';
import { ConversationHealthBadges } from './ConversationHealthBadges';

interface Props {
  project: Project;
  analysis: ConversationAnalysis;
  onClose: () => void;
}

export function ConversationDiagnosticPanel({ project, analysis, onClose }: Props) {
  const { t } = useTranslation('conversations');
  const [rawMessages, setRawMessages] = useState<ConversationMessage[] | null>(null);
  const [rawLoading, setRawLoading] = useState(false);

  const topTools = useMemo(
    () =>
      Object.entries(analysis.toolStats)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5),
    [analysis.toolStats],
  );

  function openRawMessages() {
    if (rawMessages || rawLoading) return;
    setRawLoading(true);
    window.nakiros
      .getProjectConversationMessages(project.id, analysis.sessionId)
      .then((msgs) => {
        setRawMessages(msgs);
        setRawLoading(false);
      });
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex min-w-0 items-center gap-3">
          <ScoreChip score={analysis.score} />
          <span className="min-w-0 flex-1 truncate" title={analysis.summary || analysis.sessionId}>
            {analysis.summary || analysis.sessionId}
          </span>
        </div>
      }
    >
      <div className="flex max-h-[80vh] flex-col gap-5 overflow-y-auto pr-1">
        {/* Diagnostic one-liner */}
        <p className="text-sm leading-relaxed text-[var(--text-primary)]">
          {analysis.diagnostic}
        </p>

        {/* Actionable tips — the whole point of the analyzer. */}
        <TipsSection tips={analysis.tips} />


        {/* Timeline */}
        <section>
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t('drawer.timeline')}
            </h3>
            <span className="text-[10px] text-[var(--text-muted)]">
              {t('drawer.timelineLegend')}
            </span>
          </div>
          <ConversationTimeline analysis={analysis} />
          <div className="mt-2">
            <ConversationHealthBadges analysis={analysis} />
          </div>
        </section>

        {/* Fields grid */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={t('drawer.fields.messages')} value={analysis.messageCount.toString()} />
          <Field
            label={t('drawer.fields.duration')}
            value={formatDuration(analysis.durationMs)}
          />
          <Field
            label={t('drawer.fields.maxContext')}
            value={`${Math.round(analysis.maxContextTokens / 1000)}k`}
          />
          <Field
            label={t('drawer.fields.tokensTotal')}
            value={formatLargeTokens(analysis.totalTokens)}
          />
        </section>

        {/* Cache efficiency */}
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {t('drawer.cache')}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field
              label={t('drawer.fields.cacheRead')}
              value={formatLargeTokens(analysis.cacheReadTokens)}
            />
            <Field
              label={t('drawer.fields.cacheCreation')}
              value={formatLargeTokens(analysis.cacheCreationTokens)}
            />
            <Field
              label={t('drawer.fields.cacheMisses')}
              value={analysis.cacheMissTurns.toString()}
              accent={analysis.cacheMissTurns >= 3}
            />
            <Field
              label={t('drawer.fields.wasted')}
              value={formatLargeTokens(analysis.wastedCacheTokens)}
              accent={analysis.wastedCacheTokens > 0}
            />
          </div>
        </section>

        {/* Top tools */}
        {topTools.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t('drawer.tools')}
            </h3>
            <ul className="flex flex-col gap-1 text-xs">
              {topTools.map(([name, stats]) => (
                <li
                  key={name}
                  className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--bg-soft)] px-2 py-1"
                >
                  <span className="font-medium text-[var(--text-primary)]">{name}</span>
                  <span className="text-[var(--text-muted)]">
                    ×{stats.count}
                    {stats.errorCount > 0 && (
                      <span className="ml-2 text-[var(--danger)]">
                        {stats.errorCount} err
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Hot files */}
        {analysis.hotFiles.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t('drawer.hotFiles')}
            </h3>
            <ul className="flex flex-col gap-1 text-xs">
              {analysis.hotFiles.slice(0, 8).map((f) => (
                <li
                  key={f.path}
                  className="flex items-center justify-between gap-3 rounded border border-[var(--line)] bg-[var(--bg-soft)] px-2 py-1"
                >
                  <span
                    className="truncate text-[var(--text-primary)]"
                    title={f.path}
                  >
                    {shortenPath(f.path)}
                  </span>
                  <span className="shrink-0 text-[var(--text-muted)]">×{f.editCount}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Raw link */}
        <section className="border-t border-[var(--line)] pt-3">
          {!rawMessages && !rawLoading && (
            <button
              type="button"
              onClick={openRawMessages}
              className="text-xs text-[var(--text-muted)] underline hover:text-[var(--text-primary)]"
            >
              {t('drawer.rawLink')}
            </button>
          )}
          {rawLoading && (
            <div className="text-xs text-[var(--text-muted)]">{t('loadingMessages')}</div>
          )}
          {rawMessages && <RawMessageList messages={rawMessages} />}
        </section>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function TipsSection({ tips }: { tips: ConversationTip[] }) {
  const { t } = useTranslation('conversations');
  if (tips.length === 0) {
    return (
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {t('drawer.tips')}
        </h3>
        <div className="rounded border border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2 text-xs text-[var(--text-muted)]">
          {t('drawer.tipsEmpty')}
        </div>
      </section>
    );
  }
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {t('drawer.tips')}
      </h3>
      <ul className="flex flex-col gap-2">
        {tips.map((tip) => (
          <TipItem key={tip.id} tip={tip} />
        ))}
      </ul>
    </section>
  );
}

function TipItem({ tip }: { tip: ConversationTip }) {
  const { t } = useTranslation('conversations');
  const { icon, tone } = severityStyle(tip.severity);
  return (
    <li
      className={
        'flex items-start gap-3 rounded-lg border px-3 py-2.5 text-xs ' + tone
      }
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-sm font-semibold text-[var(--text-primary)]">
          {t(`tips.${tip.id}.title`, tip.data)}
        </div>
        <div className="leading-relaxed text-[var(--text-muted)]">
          {t(`tips.${tip.id}.body`, tip.data)}
        </div>
      </div>
    </li>
  );
}

function severityStyle(severity: ConversationTip['severity']): {
  icon: React.ReactNode;
  tone: string;
} {
  switch (severity) {
    case 'critical':
      return {
        icon: <AlertCircle size={16} className="text-[var(--danger)]" />,
        tone: 'border-[var(--danger)] bg-[var(--bg-soft)]',
      };
    case 'warning':
      return {
        icon: <AlertTriangle size={16} className="text-[var(--warning)]" />,
        tone: 'border-[var(--warning)] bg-[var(--bg-soft)]',
      };
    default:
      return {
        icon: <Lightbulb size={16} className="text-[var(--primary)]" />,
        tone: 'border-[var(--line)] bg-[var(--bg-soft)]',
      };
  }
}

function Field({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded border border-[var(--line)] bg-[var(--bg-soft)] px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div
        className={
          'text-sm font-semibold ' +
          (accent ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]')
        }
      >
        {value}
      </div>
    </div>
  );
}

function ScoreChip({ score }: { score: number }) {
  // Higher score = healthier (100 = clean, 0 = critical).
  const tone =
    score <= 40
      ? 'bg-[var(--danger)] text-white'
      : score <= 70
        ? 'bg-[var(--warning)] text-black'
        : 'bg-[var(--success)] text-white';
  return (
    <span
      className={
        'inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ' + tone
      }
    >
      {score}
    </span>
  );
}

function RawMessageList({ messages }: { messages: ConversationMessage[] }) {
  return (
    <div className="mt-2 flex max-h-96 flex-col gap-2 overflow-y-auto rounded border border-[var(--line)] p-2">
      {messages.map((m) => (
        <div
          key={m.uuid}
          className={
            'rounded px-2 py-1.5 text-xs ' +
            (m.type === 'user'
              ? 'bg-[var(--primary-soft)] text-[var(--text-primary)]'
              : 'border border-[var(--line)] bg-[var(--bg-card)]')
          }
        >
          <div className="mb-0.5 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
            <span className="font-semibold capitalize">{m.type}</span>
            <span>{new Date(m.timestamp).toLocaleTimeString()}</span>
          </div>
          <div className="whitespace-pre-wrap">
            {m.content.slice(0, 1000)}
            {m.content.length > 1000 && '…'}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h${rem}m`;
}

function formatLargeTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function shortenPath(path: string, maxSegments = 3): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= maxSegments) return path;
  return '…/' + parts.slice(-maxSegments).join('/');
}
