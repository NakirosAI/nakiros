import { forwardRef, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

export interface SessionFeedbackHandle {
  autoSubmitIfPending(): void;
}

interface SessionFeedbackProps {
  sessionId: string;
  workspaceId: string;
  agent: string | null;
  workflow: string | null;
  editor: string;
  messageCount: number;
  getDurationSeconds: () => number;
  getRawLines: () => unknown[];
}

const SessionFeedback = forwardRef<SessionFeedbackHandle, SessionFeedbackProps>(
  function SessionFeedback(
    { sessionId, workspaceId, agent, workflow, editor, messageCount, getDurationSeconds, getRawLines },
    ref,
  ) {
    const { t } = useTranslation('feedback');
    const [rating, setRating] = useState<1 | -1 | null>(null);
    const [comment, setComment] = useState('');
    const [shareConversation, setShareConversation] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    async function submit(opts: { withComment: boolean; withConversation: boolean }): Promise<void> {
      const data: SessionFeedbackData = {
        session_id: sessionId,
        workspace_id: workspaceId,
        rating: rating!,
        agent: agent ?? 'free',
        workflow: workflow ?? undefined,
        editor,
        duration_seconds: getDurationSeconds(),
        message_count: messageCount,
        ...(opts.withComment && comment ? { comment } : {}),
        conversation_shared: opts.withConversation,
        ...(opts.withConversation ? { conversation: getRawLines() } : {}),
      };
      setSubmitted(true);
      try {
        await window.nakiros.sendSessionFeedback(data);
      } catch {
        // Silently fail — the service queues on error
      }
    }

    useImperativeHandle(ref, () => ({
      autoSubmitIfPending() {
        if (rating !== null && !submitted) {
          void submit({ withComment: false, withConversation: false });
        }
      },
    }));

    if (messageCount === 0) return null;

    if (submitted) {
      return (
        <div className="shrink-0 border-t border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2">
          <span className="text-xs text-[var(--text-muted)]">{t('thanks')}</span>
        </div>
      );
    }

    return (
      <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--line)] bg-[var(--bg-soft)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[11px] text-[var(--text-muted)]">{t('sessionQuestion')}</span>
          <button
            onClick={() => setRating(1)}
            className={clsx(
              'rounded-md border px-[7px] py-0.5 text-sm leading-[1.4]',
              rating === 1
                ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                : 'border-[var(--line)] bg-transparent',
            )}
            title={t('thumbsUp')}
          >
            👍
          </button>
          <button
            onClick={() => setRating(-1)}
            className={clsx(
              'rounded-md border px-[7px] py-0.5 text-sm leading-[1.4]',
              rating === -1
                ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                : 'border-[var(--line)] bg-transparent',
            )}
            title={t('thumbsDown')}
          >
            👎
          </button>
        </div>

        {rating !== null && (
          <>
            <input
              type="text"
              placeholder={t('commentPlaceholder')}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="ui-form-control box-border w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-[5px] text-[11px] text-[var(--text)]"
            />

            <div className="flex flex-col gap-1">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={shareConversation}
                  onChange={(e) => setShareConversation(e.target.checked)}
                  className="m-0"
                />
                <span className="text-[11px] text-[var(--text-muted)]">{t('shareConversation')}</span>
              </label>
              <span className="pl-[18px] text-[10px] text-[var(--text-muted)] opacity-70">{t('shareWarning')}</span>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => void submit({ withComment: true, withConversation: shareConversation })}
                className="rounded-md border-none bg-[var(--primary)] px-3 py-1 text-[11px] font-semibold text-white"
              >
                {t('send')}
              </button>
            </div>
          </>
        )}
      </div>
    );
  },
);

export default SessionFeedback;
