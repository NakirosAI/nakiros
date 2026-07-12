import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Send } from 'lucide-react';

interface Props {
  /** True while the agent is explicitly waiting (either for a chat reply or a plan approval). */
  isWaiting: boolean;
  /** True while the agent is mid-turn — the composer stays visible but disabled. */
  isRunning: boolean;
  onSend(message: string): Promise<void>;
}

/**
 * Chat composer for the bootstrap discuss step — native `n-*`-styled
 * equivalent of `components/runs/HumanInteractionPanel.tsx` (that component
 * hardcodes legacy `--line` / `--bg-soft` CSS vars which aren't defined on
 * the new design, see `.claude/rules/ui-kit.md`). Accepts messages while the
 * run is `waiting_for_input` **or** `awaiting_approval` — the feature's
 * decision #3 lets the user keep discussing the plan even once it's ready
 * for approval.
 */
export function BootstrapComposer({ isWaiting, isRunning, onSend }: Props) {
  const { t } = useTranslation('bootstrap');
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

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
      window.alert(
        t('composer.sendFailed', {
          defaultValue: 'Could not send: {{message}}',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setSending(false);
    }
  }

  const placeholder = isWaiting
    ? t('composer.placeholderWaiting', {
        defaultValue: 'Reply or ask to change the plan… (Enter to send, Shift+Enter for new line)',
      })
    : isRunning
      ? t('composer.placeholderRunning', { defaultValue: 'Agent is working…' })
      : t('composer.placeholderIdle', { defaultValue: 'Start a bootstrap run to discuss it here.' });

  return (
    <div
      className={
        'flex-shrink-0 border-t px-4 py-3 ' +
        (isWaiting ? 'border-n-watch/30 bg-n-watch-soft' : 'border-n-border-subtle bg-n-canvas')
      }
    >
      {isWaiting && (
        <div className="mb-2 flex items-center gap-1.5 font-n-mono text-[11px] text-n-watch">
          <MessageSquare size={12} strokeWidth={2} />
          {t('composer.waitingBanner', { defaultValue: 'Agent is waiting for your input' })}
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
          className="min-h-[56px] flex-1 resize-none rounded-n-md border border-n-border-subtle bg-n-surface p-2.5 text-[12.5px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!value.trim() || sending || disabled}
          aria-label={t('composer.send', { defaultValue: 'Send' })}
          title={t('composer.send', { defaultValue: 'Send' })}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center self-end rounded-n-md border border-n-accent-line bg-n-accent-soft text-n-accent hover:bg-n-accent-soft/80 disabled:opacity-50"
        >
          <Send size={15} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
