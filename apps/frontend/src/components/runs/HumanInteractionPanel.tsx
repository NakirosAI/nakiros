import { useState, type ReactNode } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

interface Props {
  /**
   * Whether the agent is explicitly waiting for the user (highlighted style +
   * autofocus + waiting banner). False = the agent is running but the user can
   * still queue a message.
   */
  isWaiting: boolean;
  /** True while the agent is mid-turn; the textarea is disabled in that case. */
  isRunning?: boolean;
  /**
   * Async callback invoked with the trimmed message when the user sends. Should
   * throw if the send fails — the panel will surface the error via `alert`.
   */
  onSend(message: string): Promise<void>;
  /** Override placeholder when waiting (defaults to the shared key). */
  placeholderWaiting?: string;
  /** Override placeholder when running (defaults to the shared key). */
  placeholderRunning?: string;
  /** Override placeholder when idle (defaults to the shared key). */
  placeholderIdle?: string;
  /** Optional waiting-banner copy override. */
  waitingBanner?: string;
  /**
   * Optional extra buttons rendered in the same column as Send (stacked
   * vertically). Use for kind-specific shortcuts that pair with the input —
   * e.g. eval's "finish without replying" flag button.
   */
  extraButtons?: ReactNode;
}

/**
 * Permanent input bar for the human-in-the-loop interaction with any agent
 * run. Renders a textarea + Send button and toggles between three states
 * (waiting / running / idle) with shared copy from the `runs` i18n namespace.
 *
 * Used by `AuditView`, `FixView` (fix + create modes) and any future run kind
 * that exposes `canSendMessage`.
 */
export function HumanInteractionPanel({
  isWaiting,
  isRunning = false,
  onSend,
  placeholderWaiting,
  placeholderRunning,
  placeholderIdle,
  waitingBanner,
  extraButtons,
}: Props) {
  const { t } = useTranslation('runs');
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  // Disable input while a turn is mid-flight unless the agent has explicitly
  // asked for input — otherwise the agent could swallow our message.
  const disabled = isRunning && !isWaiting;

  async function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setValue('');
    try {
      await onSend(trimmed);
    } catch (err) {
      setValue(trimmed);
      alert(t('input.sendFailed', { message: (err as Error).message }));
    } finally {
      setSending(false);
    }
  }

  const placeholder = isWaiting
    ? placeholderWaiting ?? t('input.placeholderWaiting')
    : isRunning
      ? placeholderRunning ?? t('input.placeholderRunning')
      : placeholderIdle ?? t('input.placeholderIdle');

  return (
    <div
      className={clsx(
        'border-t p-3',
        isWaiting
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-[var(--line)] bg-[var(--bg-soft)]',
      )}
    >
      {isWaiting && (
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-400">
          <MessageSquare size={12} />
          {waitingBanner ?? t('input.waitingBanner')}
        </div>
      )}
      <div className="flex gap-2">
        <textarea
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
          className="min-h-[60px] flex-1 resize-none rounded-lg border border-[var(--line)] bg-[var(--bg-card)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] disabled:opacity-50"
        />
        <div className="flex flex-col gap-2">
          <button
            onClick={handleSend}
            disabled={!value.trim() || sending || disabled}
            aria-label={t('input.send')}
            title={t('input.send')}
            className="flex shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] p-2.5 text-white transition-colors hover:bg-[var(--primary)]/90 disabled:opacity-50"
          >
            <Send size={16} />
          </button>
          {extraButtons}
        </div>
      </div>
    </div>
  );
}
