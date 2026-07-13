import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ConversationMessage,
} from '@nakiros/shared';
import { useConversationMessages } from '../../hooks/useConversationMessages';
import { LoadingState } from '../ui';
import type { ProviderConversationAnalysis } from '../../hooks/useConversationAnalyses';

interface Props {
  analysis: ProviderConversationAnalysis;
}

/**
 * Tab body that streams the JSONL turns of a conversation as message cards.
 * Joins each message with `analysis.compactions` and `analysis.frictionPoints`
 * by timestamp (±2s) so user turns flagged as friction and system turns
 * flagged as compactions get the right visual treatment without backend
 * changes. Tool errors don't surface yet — `ConversationMessage` doesn't
 * carry an `isError` flag (deferred to a future analyzer extension).
 */
export function TimelineTab({ analysis }: Props) {
  const { t } = useTranslation('conversations');
  const fetched = useConversationMessages(analysis.projectId, analysis.sessionId);

  const enriched = useMemo(() => {
    if (!fetched) return null;
    return enrichMessages(fetched, analysis);
  }, [fetched, analysis]);

  const [filter, setFilter] = useState<TimelineFilter>('all');

  if (enriched === null) {
    return <LoadingState>{t('loadingMessages')}</LoadingState>;
  }

  const counts = countByFilter(enriched);
  const visible = enriched.filter(filterMatch(filter));

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="sticky top-0 z-10 -mx-5 flex flex-wrap items-center gap-1.5 border-b border-n-border-subtle bg-n-canvas px-5 py-2">
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-n-mono text-[11px] transition-colors ' +
                (active
                  ? 'border-n-accent-line bg-n-accent-soft text-n-accent-strong'
                  : 'border-n-border-default bg-transparent text-n-muted hover:text-n-fg')
              }
            >
              <span>{t(`timeline.filter.${f}`)}</span>
              <span className={'tabular-nums ' + (active ? 'text-n-accent-strong' : 'text-n-faint')}>
                {counts[f]}
              </span>
            </button>
          );
        })}
        <span className="ml-auto font-n-mono text-[10.5px] text-n-faint">
          {t('messageCount', { count: visible.length })} / {enriched.length}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {visible.length === 0 ? (
          <div className="rounded-n-md border border-n-border-subtle bg-n-sunken px-4 py-6 text-center font-n-mono text-[11.5px] text-n-faint">
            {t('timeline.empty')}
          </div>
        ) : (
          visible.map((m) => <MessageCard key={m.uuid} m={m} />)
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type TimelineFilter = 'all' | 'user' | 'assistant' | 'tools' | 'system' | 'friction';

const FILTERS: TimelineFilter[] = ['all', 'user', 'assistant', 'tools', 'system', 'friction'];

interface EnrichedMessage extends ConversationMessage {
  isFriction: boolean;
  isInFrictionZone: boolean;
  isCompaction: boolean;
  compactionPre?: number;
  compactionPost?: number;
  frictionPattern?: string;
}

/**
 * Aligns each message with friction/compaction signals from the analysis.
 * Match is by closest timestamp within a 2-second window; that's loose
 * enough for clock skew between the JSONL sample and the analyzer pass,
 * tight enough that two distinct events never collide.
 *
 * Also marks messages whose timestamp falls within any frictionZone
 * [startTimestamp, endTimestamp] range as `isInFrictionZone=true`, so the
 * 'friction' filter can expose the agent context (assistant turns, tool calls)
 * that preceded the user reaction — not just the reaction itself.
 */
function enrichMessages(
  messages: ConversationMessage[],
  analysis: ProviderConversationAnalysis,
): EnrichedMessage[] {
  const compactionByTs = new Map<number, { preTokens?: number; postTokens?: number }>();
  for (const c of analysis.compactions) {
    const ts = Date.parse(c.timestamp);
    if (!Number.isNaN(ts)) {
      compactionByTs.set(ts, 'preTokens' in c
        ? { preTokens: c.preTokens, postTokens: c.postTokens }
        : {});
    }
  }
  const frictionByTs = new Map<number, { matchedPattern: string }>();
  const frictionPoints = analysis.frictionPoints;
  for (const f of frictionPoints) {
    const ts = Date.parse(f.timestamp);
    if (!Number.isNaN(ts)) frictionByTs.set(ts, f);
  }

  // Pre-compute zone ranges as [startMs, endMs] pairs once — avoids
  // re-parsing ISO strings in the inner loop over messages.
  const zoneRanges: Array<[number, number]> = ('frictionZones' in analysis ? analysis.frictionZones ?? [] : [])
    .map((z) => [Date.parse(z.startTimestamp), Date.parse(z.endTimestamp)] as [number, number])
    .filter(([s, e]) => !Number.isNaN(s) && !Number.isNaN(e));

  return messages.map((m) => {
    const ts = Date.parse(m.timestamp);
    const compaction = nearest(compactionByTs, ts, 2000);
    const friction = nearest(frictionByTs, ts, 2000);
    const isInFrictionZone =
      !Number.isNaN(ts) && zoneRanges.some(([s, e]) => ts >= s && ts <= e);
    return {
      ...m,
      isCompaction: !!compaction,
      compactionPre: compaction?.preTokens,
      compactionPost: compaction?.postTokens,
      isFriction: !!friction,
      isInFrictionZone,
      frictionPattern: friction?.matchedPattern,
    };
  });
}

function nearest<T>(map: Map<number, T>, target: number, windowMs: number): T | undefined {
  if (Number.isNaN(target)) return undefined;
  let best: { ts: number; value: T } | undefined;
  for (const [ts, value] of map) {
    if (Math.abs(ts - target) > windowMs) continue;
    if (!best || Math.abs(ts - target) < Math.abs(best.ts - target)) {
      best = { ts, value };
    }
  }
  return best?.value;
}

function countByFilter(messages: EnrichedMessage[]): Record<TimelineFilter, number> {
  const out: Record<TimelineFilter, number> = {
    all: messages.length,
    user: 0,
    assistant: 0,
    tools: 0,
    system: 0,
    friction: 0,
  };
  for (const m of messages) {
    if (m.type === 'user') out.user++;
    else if (m.type === 'assistant') out.assistant++;
    else if (m.type === 'system') out.system++;
    if (m.toolUse && m.toolUse.length > 0) out.tools++;
    if (m.isFriction || m.isInFrictionZone) out.friction++;
  }
  return out;
}

function filterMatch(filter: TimelineFilter): (m: EnrichedMessage) => boolean {
  if (filter === 'all') return () => true;
  if (filter === 'tools') return (m) => !!m.toolUse && m.toolUse.length > 0;
  if (filter === 'friction') return (m) => m.isFriction || m.isInFrictionZone;
  return (m) => m.type === filter;
}

// ---------------------------------------------------------------------------

function MessageCard({ m }: { m: EnrichedMessage }) {
  const time = formatTime(m.timestamp);

  if (m.isCompaction) {
    return (
      <div className="flex items-start gap-2.5 rounded-n-md border border-dashed border-n-info bg-n-info-soft px-3.5 py-2.5">
        <span className="w-[60px] flex-shrink-0 font-n-mono text-[10px] uppercase tracking-[0.6px] text-n-info">
          {time}
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-n-info">⤓ Compaction</span>
            {m.compactionPre != null && m.compactionPost != null && (
              <span className="font-n-mono text-[10.5px] text-n-muted">
                {Math.round(m.compactionPre / 1000)}k → {Math.round(m.compactionPost / 1000)}k
              </span>
            )}
          </div>
          {m.content && (
            <div className="mt-1 line-clamp-3 text-[12px] italic leading-relaxed text-n-muted">
              "{m.content}"
            </div>
          )}
        </div>
      </div>
    );
  }

  const isUser = m.type === 'user';
  const isFriction = m.isFriction;
  const isZoneContext = m.isInFrictionZone && !m.isFriction;

  const wrapperClass = isFriction
    ? 'border-n-critical bg-n-critical-soft'
    : isZoneContext
      ? 'border-n-border-subtle bg-n-surface'
      : 'border-n-border-subtle bg-n-surface';
  const accentClass = isFriction
    ? 'before:bg-n-critical'
    : isZoneContext
      ? 'before:bg-n-warning/40'
      : isUser
        ? 'before:bg-n-accent'
        : 'before:bg-n-track-tokens';

  return (
    <div
      className={
        'relative flex items-start gap-2.5 overflow-hidden rounded-n-md border px-3.5 py-2.5 ' +
        'before:absolute before:left-0 before:top-0 before:h-full before:w-0.5 ' +
        wrapperClass +
        ' ' +
        accentClass
      }
    >
      <span className="w-[60px] flex-shrink-0 pt-0.5 font-n-mono text-[10px] text-n-faint">
        {time}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={
              'inline-flex items-center rounded-full px-2 py-0.5 font-n-mono text-[9.5px] font-semibold uppercase tracking-[0.7px] ' +
              (isUser
                ? 'bg-n-accent-soft text-n-accent-strong'
                : m.type === 'assistant'
                  ? 'bg-n-info-soft text-n-info'
                  : 'bg-n-raised text-n-muted')
            }
          >
            {m.type}
          </span>
          {isFriction && (
            <span className="font-n-mono text-[10.5px] font-semibold text-n-critical">
              ⚠ {m.frictionPattern ?? 'friction'}
            </span>
          )}
          {m.isSidechain && (
            <span className="font-n-mono text-[10px] text-n-faint">sidechain</span>
          )}
        </div>
        {m.content && (
          <div
            className={
              'whitespace-pre-wrap text-[12.5px] leading-relaxed ' +
              (isFriction ? 'text-n-fg' : 'text-n-muted')
            }
          >
            {m.content}
          </div>
        )}
        {m.toolUse && m.toolUse.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {m.toolUse.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-n-xs border border-n-border-subtle bg-n-canvas px-2 py-1 font-n-mono text-[11px]"
              >
                <span className="rounded-n-xs bg-n-sunken px-1.5 py-0.5 text-[9.5px] font-semibold text-n-track-tools">
                  {t.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-n-muted">
                  {summarizeToolInput(t.input)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function summarizeToolInput(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  try {
    const json = JSON.stringify(input);
    return json.length > 140 ? json.slice(0, 140) + '…' : json;
  } catch {
    return '';
  }
}
