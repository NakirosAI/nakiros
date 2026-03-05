import React, { useState } from 'react';
import type { ResolvedLanguage } from '@nakiros/shared';
import { MESSAGES } from '../i18n.js';

interface Props {
  lang: ResolvedLanguage;
  onClose: () => void;
  onToast: (message: string) => void;
}

type Category = 'bug' | 'suggestion' | 'agent' | 'workflow' | 'ux';
type Status = 'idle' | 'sending' | 'error';

export default function FeedbackModal({ lang, onClose, onToast }: Props) {
  const msg = MESSAGES[lang].feedback;
  const [category, setCategory] = useState<Category>('suggestion');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const canSend = message.length >= 10 && status !== 'sending';

  async function handleSend() {
    if (!canSend) return;
    setStatus('sending');
    try {
      await window.nakiros.sendProductFeedback({ category, message });
      onClose();
      onToast(msg.thanks);
    } catch {
      setStatus('error');
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeader}>
          <span style={modalTitle}>{msg.productTitle}</span>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>

        <div style={field}>
          <label style={fieldLabel}>{msg.categoryLabel}</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            style={selectStyle}
          >
            <option value="bug">{msg.categories.bug}</option>
            <option value="suggestion">{msg.categories.suggestion}</option>
            <option value="agent">{msg.categories.agent}</option>
            <option value="workflow">{msg.categories.workflow}</option>
            <option value="ux">{msg.categories.ux}</option>
          </select>
        </div>

        <div style={field}>
          <label style={fieldLabel}>{msg.messageLabel}</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={2000}
            style={textareaStyle}
            autoFocus
          />
          <span style={hintText}>{msg.messageMin}</span>
        </div>

        {status === 'error' && (
          <div style={errorText}>{msg.errorNetwork}</div>
        )}

        <div style={actions}>
          <button onClick={onClose} style={cancelBtn}>{msg.cancel}</button>
          <button onClick={() => void handleSend()} disabled={!canSend} style={sendBtn(!canSend)}>
            {status === 'sending' ? '…' : msg.send}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modal: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: '20px 24px',
  width: 420,
  maxWidth: '90vw',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const modalHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const modalTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--text)',
};

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 18,
  color: 'var(--text-muted)',
  lineHeight: 1,
  padding: '0 2px',
};

const field: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-soft)',
  border: '1px solid var(--line)',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 12,
  padding: '6px 8px',
  outline: 'none',
};

const textareaStyle: React.CSSProperties = {
  background: 'var(--bg-soft)',
  border: '1px solid var(--line)',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 12,
  padding: '8px 10px',
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
};

const hintText: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted)',
};

const errorText: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--danger)',
};

const actions: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

const cancelBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--line)',
  borderRadius: 6,
  color: 'var(--text-muted)',
  fontSize: 12,
  padding: '5px 12px',
  cursor: 'pointer',
};

function sendBtn(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? 'var(--bg-muted)' : 'var(--primary)',
    border: 'none',
    borderRadius: 6,
    color: disabled ? 'var(--text-muted)' : '#fff',
    fontSize: 12,
    fontWeight: 600,
    padding: '5px 14px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
