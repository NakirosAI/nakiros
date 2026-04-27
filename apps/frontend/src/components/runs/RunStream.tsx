import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Terminal } from 'lucide-react';
import type { AuditRun, AuditRunTurn } from '@nakiros/shared';
import type { LiveStreamEvent } from '../ConversationTurn';

interface RunStreamProps {
  /** Persisted turns from the run snapshot (read-only). */
  turns: AuditRunTurn[];
  /** Live in-flight events appended since the last persisted turn. */
  liveEvents: LiveStreamEvent[];
  /** Whether the run is currently emitting — adds the "streaming…" tail. */
  isStreaming: boolean;
}

interface RenderedItem {
  /** Stable key for React. */
  key: string;
  /** Optional ISO timestamp — formatted into a 56px mono gutter. */
  timestamp?: string;
  /** Rendered body. */
  body: React.ReactNode;
}

/**
 * Streaming chat view for the run screen — port of `StreamView` /
 * `StreamEvent` in `apps/Nakiros-new-design/screens-runs.jsx:125-298`
 * to the OKLch token set.
 *
 * The mockup carries 7 event types (system / tool / assistant /
 * finding / diff / assertion / thinking). The Nakiros daemon currently
 * emits only `text` (assistant) and `tool` events through the live
 * subscription. This component renders both kinds in the same visual
 * language as the mockup; the four "rich" types (finding / diff /
 * assertion / thinking) are not produced by the runner today and will
 * land when the daemon emits them.
 *
 * Persisted turns from the run snapshot are flattened into the same
 * stream so a freshly-opened run renders the prior conversation before
 * the live cursor.
 */
export default function RunStream({ turns, liveEvents, isStreaming }: RunStreamProps) {
  const { t } = useTranslation('runs');
  const scrollRef = useRef<HTMLDivElement>(null);
  const items = buildItems(turns, liveEvents);

  // Pin to bottom whenever new content lands.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items.length]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto bg-n-canvas px-6 py-5">
      <div className="mx-auto flex max-w-[920px] flex-col gap-4">
        {items.map((item) => (
          <div key={item.key} className="flex items-start gap-2.5">
            <TimestampGutter ts={item.timestamp} />
            <div className="min-w-0 flex-1">{item.body}</div>
          </div>
        ))}
        {isStreaming && (
          <div className="mt-1 flex items-center gap-2 font-n-mono text-[11.5px] text-n-faint">
            <span className="n-pulse h-1.5 w-1.5 rounded-full bg-n-accent" />
            {t('streaming', { defaultValue: 'streaming…' })}
            <span className="n-shimmer-bg ml-2 h-px flex-1" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Item builder ───────────────────────────────────────────────────────────

function buildItems(turns: AuditRunTurn[], liveEvents: LiveStreamEvent[]): RenderedItem[] {
  const out: RenderedItem[] = [];

  // Each persisted turn becomes one or more items based on its blocks.
  turns.forEach((turn, ti) => {
    const ts = turn.timestamp;
    if (turn.role === 'user') {
      out.push({
        key: `t${ti}-user`,
        timestamp: ts,
        body: <UserText text={turn.content ?? ''} />,
      });
      return;
    }
    // Assistant turn: text body + tool calls (if any).
    const hasText = !!turn.content && turn.content.trim() !== '';
    const hasTools = !!turn.tools && turn.tools.length > 0;
    if (hasText) {
      out.push({
        key: `t${ti}-assistant`,
        timestamp: ts,
        body: <AssistantText text={turn.content!} />,
      });
    }
    if (hasTools) {
      turn.tools!.forEach((tool, toolIdx) => {
        out.push({
          key: `t${ti}-tool-${toolIdx}`,
          timestamp: ts,
          body: <ToolBox name={tool.name} display={tool.display} />,
        });
      });
    }
    // Surface a placeholder for assistant turns that produced neither
    // text nor tool calls. Without this the chat looks like only the
    // user message exists, even though the run did complete a turn —
    // exactly the "no AI reply visible" bug Thomas hit on a baseline
    // run where claude had nothing to say.
    if (!hasText && !hasTools && turn.role === 'assistant') {
      out.push({
        key: `t${ti}-empty`,
        timestamp: ts,
        body: <EmptyAssistantPlaceholder />,
      });
    }
  });

  // Live events for the in-flight turn.
  liveEvents.forEach((ev, li) => {
    if (ev.type === 'text') {
      out.push({
        key: `live-${li}-text`,
        timestamp: tsFromEpoch(ev.ts),
        body: <AssistantText text={ev.text} />,
      });
    } else if (ev.type === 'tool') {
      out.push({
        key: `live-${li}-tool`,
        timestamp: tsFromEpoch(ev.ts),
        body: <ToolBox name={ev.name} display={ev.display} />,
      });
    }
  });

  return out;
}

// ── Renderers ──────────────────────────────────────────────────────────────

function AssistantText({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-n-xs bg-n-accent-soft text-n-accent">
        <Sparkles size={13} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-relaxed text-n-fg">
        {text}
      </div>
    </div>
  );
}

function EmptyAssistantPlaceholder() {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-n-xs bg-n-sunken text-n-faint">
        <Sparkles size={13} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1 text-[12.5px] italic text-n-faint">
        (no assistant reply — the run completed without producing text or tool calls)
      </div>
    </div>
  );
}

function UserText({ text }: { text: string }) {
  return (
    <div className="rounded-n-md border border-n-border-subtle bg-n-surface px-3.5 py-2 text-[13px] leading-relaxed text-n-fg">
      {text}
    </div>
  );
}

function ToolBox({ name, display }: { name: string; display: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-n-md border border-n-border-subtle bg-n-sunken px-3 py-2 font-n-mono text-[12px]">
      <Terminal size={13} strokeWidth={2} className="flex-shrink-0 text-n-accent" />
      <span className="flex-shrink-0 text-n-accent">{name}</span>
      <span className="min-w-0 flex-1 truncate text-n-muted">{display}</span>
    </div>
  );
}

function SystemLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 font-n-mono text-[11.5px] text-n-faint">
      <span className="h-1.5 w-1.5 rounded-full bg-n-faint" />
      <span className="min-w-0 flex-1">{text}</span>
    </div>
  );
}

function TimestampGutter({ ts }: { ts?: string }) {
  return (
    <span className="w-14 flex-shrink-0 pt-0.5 font-n-mono tabular-nums text-[10.5px] text-n-faint">
      {ts ? formatHHMMSS(ts) : ''}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatHHMMSS(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function tsFromEpoch(epochMs: number): string {
  return new Date(epochMs).toISOString();
}
