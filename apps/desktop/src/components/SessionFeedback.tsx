import React, { forwardRef, useImperativeHandle, useState } from 'react';
import type { ResolvedLanguage } from '@nakiros/shared';
import { MESSAGES } from '../i18n.js';

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
  lang: ResolvedLanguage;
}

const SessionFeedback = forwardRef<SessionFeedbackHandle, SessionFeedbackProps>(
  function SessionFeedback(
    { sessionId, workspaceId, agent, workflow, editor, messageCount, getDurationSeconds, getRawLines, lang },
    ref,
  ) {
    const msg = MESSAGES[lang].feedback;
    const [rating, setRating] = useState<1 | -1 | null>(null);
    const [comment, setComment] = useState('');
    const [shareConversation, setShareConversation] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    async function submit(opts: { withComment: boolean; withConversation: boolean }): Promise<void> {
      const data: SessionFeedbackData = {
        session_id: sessionId,
        workspace_id: workspaceId,
        rating: rating!,
        agent: agent ?? 'libre',
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
        <div style={container}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{msg.thanks}</span>
        </div>
      );
    }

    return (
      <div style={container}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={questionText}>{msg.sessionQuestion}</span>
          <button
            onClick={() => setRating(1)}
            style={thumbButton(rating === 1)}
            title="Utile"
          >
            👍
          </button>
          <button
            onClick={() => setRating(-1)}
            style={thumbButton(rating === -1)}
            title="Pas utile"
          >
            👎
          </button>
        </div>

        {rating !== null && (
          <>
            <input
              type="text"
              placeholder={msg.commentPlaceholder}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              style={commentInput}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={shareConversation}
                  onChange={(e) => setShareConversation(e.target.checked)}
                  style={{ margin: 0 }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{msg.shareConversation}</span>
              </label>
              <span style={warningText}>{msg.shareWarning}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => void submit({ withComment: true, withConversation: shareConversation })}
                style={sendBtn}
              >
                {msg.send}
              </button>
            </div>
          </>
        )}
      </div>
    );
  },
);

export default SessionFeedback;

// ─── Styles ───────────────────────────────────────────────────────────────────

const container: React.CSSProperties = {
  borderTop: '1px solid var(--line)',
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  flexShrink: 0,
  background: 'var(--bg-soft)',
};

const questionText: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  flex: 1,
};

function thumbButton(active: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--primary-muted, rgba(20,184,166,0.15))' : 'transparent',
    border: active ? '1px solid var(--primary)' : '1px solid var(--line)',
    borderRadius: 6,
    padding: '2px 7px',
    fontSize: 14,
    cursor: 'pointer',
    lineHeight: 1.4,
  };
}

const commentInput: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--line)',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 11,
  padding: '5px 8px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const checkboxRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
};

const warningText: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted)',
  opacity: 0.7,
  paddingLeft: 18,
};

const sendBtn: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '4px 12px',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
};
