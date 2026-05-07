import { useRef, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { AuditRunTurn, FixTimelineEntry } from '@nakiros/shared';
import type { LiveStreamEvent } from '../../ConversationTurn';
import RunStream from '../RunStream';
import { RunErrorBanner } from '../index';
import QuoteChip from './QuoteChip';
import type { QuoteSelection } from './types';

interface IdeChatPanelProps {
  /** Persisted turns — passed through to RunStream (legacy path for eval/create). */
  turns: AuditRunTurn[];
  /** Live in-flight events — passed through to RunStream. */
  liveEvents: LiveStreamEvent[];
  /** Whether the run is streaming. */
  isStreaming: boolean;
  /** Session-jsonl-derived timeline for fix/audit/edit (preferred over turns+liveEvents). */
  timeline?: FixTimelineEntry[];
  /** Whether the agent is explicitly waiting for human input. */
  isWaiting: boolean;
  /** Whether the agent is currently running (but not necessarily waiting). */
  isRunning: boolean;
  /** Quotes stacked from the code viewer — rendered as chips above the textarea. */
  quotes: QuoteSelection[];
  /**
   * Callback to remove a quote chip from the stack.
   * The host removes it from its `quotes` array.
   */
  onRemoveQuote(q: QuoteSelection): void;
  /** Called with the full message text (including serialised quote context) when the user sends. */
  onSend(message: string): Promise<void>;
  /** Non-critical error from the run-event handler (e.g. IPC parse failure). */
  handlerError?: string | null;
  /** Optional skill name surfaced in timeline recap cards. */
  skillName?: string;
}

/**
 * Left-hand pane of the IDE run layout.
 *
 * Wraps the existing {@link RunStream} chat timeline with a new-design
 * composer that supports stacked quote chips.  The quote chips are serialised
 * as fenced markdown blocks prepended to the user's free-form text before the
 * message is sent via `onSend`.
 *
 * The composer is intentionally re-built from native HTML elements with n-*
 * Tailwind tokens to comply with `feedback_ui_kit_first.md` — the legacy
 * `HumanInteractionPanel` uses CSS variables that clash with the new design.
 */
export default function IdeChatPanel({
  turns,
  liveEvents,
  isStreaming,
  timeline,
  isWaiting,
  isRunning,
  quotes,
  onRemoveQuote,
  onSend,
  handlerError,
  skillName,
}: IdeChatPanelProps) {
  const { t } = useTranslation('runs');
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // The textarea is disabled while the agent is running *and* not waiting.
  const disabled = isRunning && !isWaiting;

  async function handleSend() {
    const trimmed = value.trim();
    if (sending) return;
    // Allow sending with just quotes (empty text is fine when there are chips).
    if (!trimmed && quotes.length === 0) return;
    setSending(true);
    setValue('');
    try {
      // Serialise quote chips as fenced markdown context blocks prepended to
      // the user's free-form text.
      const parts: string[] = quotes.map((q) => {
        const lineRange =
          q.startLine === q.endLine ? `${q.startLine}` : `${q.startLine}–${q.endLine}`;
        return [
          `> Context: \`${q.filePath}\` lines ${lineRange}`,
          '> ```',
          q.snippet
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n'),
          '> ```',
        ].join('\n');
      });
      if (trimmed) parts.push(trimmed);
      const fullMessage = parts.join('\n\n');
      await onSend(fullMessage);
    } catch (err) {
      setValue(trimmed);
      alert(t('input.sendFailed', { message: (err as Error).message }));
    } finally {
      setSending(false);
    }
  }

  const placeholder = isWaiting
    ? t('input.placeholderWaiting')
    : isRunning
    ? t('input.placeholderRunning')
    : t('input.placeholderIdle');

  const canSend = (!disabled && !sending) && (value.trim().length > 0 || quotes.length > 0);

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-n-border-subtle bg-n-canvas">
      {/* Chat timeline — fills the available space */}
      <RunStream
        turns={turns}
        liveEvents={liveEvents}
        isStreaming={isStreaming}
        timeline={timeline}
        skillName={skillName}
      />

      {/* Non-critical error banner */}
      {handlerError && <RunErrorBanner message={handlerError} />}

      {/* Composer */}
      <div
        className={clsx(
          'shrink-0 border-t p-3',
          isWaiting
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-n-border-subtle bg-n-surface',
        )}
      >
        {/* Waiting banner */}
        {isWaiting && (
          <div className="mb-2 flex items-center gap-2 font-n-mono text-[11px] font-semibold text-amber-400">
            <MessageSquare size={12} />
            {t('input.waitingBanner')}
          </div>
        )}

        {/* Quote chips */}
        {quotes.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quotes.map((q) => (
              <QuoteChip
                key={`${q.filePath}:${q.startLine}-${q.endLine}`}
                quote={q}
                onRemove={onRemoveQuote}
              />
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !disabled) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={isWaiting}
            rows={3}
            className="min-h-[56px] flex-1 resize-none rounded-n-sm border border-n-border-subtle bg-n-canvas px-2.5 py-2 font-n-mono text-[11.5px] text-n-fg placeholder:text-n-faint focus:outline-none focus:ring-1 focus:ring-n-accent disabled:opacity-50"
          />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!canSend}
              aria-label={t('input.send')}
              title={t('input.send')}
              className="flex shrink-0 items-center justify-center rounded-n-sm bg-n-accent p-2.5 text-white transition-colors hover:bg-n-accent/90 disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
