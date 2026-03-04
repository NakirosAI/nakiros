import { useMemo, useState } from 'react';
import type { ResolvedLanguage } from '@nakiros/shared';

interface PrdDraft {
  vision: string;
  users: string;
  problem: string;
  constraints: string;
}

interface Props {
  language: ResolvedLanguage;
  onClose(): void;
  onSubmit(message: string): Promise<void>;
}

export default function PrdAssistant({ language, onClose, onSubmit }: Props) {
  const [draft, setDraft] = useState<PrdDraft>({
    vision: '',
    users: '',
    problem: '',
    constraints: '',
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const isFr = language === 'fr';

  const prompt = useMemo(() => {
    return [
      '/nak-agent-brainstorming',
      '',
      isFr ? 'Aide-moi à construire un PRD initial avec ce contexte:' : 'Help me build an initial PRD with this context:',
      '',
      `Vision: ${draft.vision || '-'}`,
      `${isFr ? 'Utilisateurs cibles' : 'Target users'}: ${draft.users || '-'}`,
      `${isFr ? 'Problème principal' : 'Main problem'}: ${draft.problem || '-'}`,
      `${isFr ? 'Contraintes' : 'Constraints'}: ${draft.constraints || '-'}`,
      '',
      isFr
        ? 'À la fin de la session, sauvegarde la synthèse dans .nakiros/context/brainstorming.md.'
        : 'At session end, save the synthesis in .nakiros/context/brainstorming.md.',
    ].join('\n');
  }, [draft, isFr]);

  const canSubmit = draft.vision.trim() && draft.users.trim() && draft.problem.trim();

  async function handleSubmit() {
    if (!canSubmit) return;
    setStatus('submitting');
    setError(null);
    try {
      await onSubmit(prompt);
      onClose();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCopyPrompt() {
    await window.nakiros.writeClipboard(prompt);
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            {isFr ? 'PRD Assistant' : 'PRD Assistant'}
          </h3>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
          {isFr
            ? 'Ce wizard prépare un prompt pour /nak-agent-brainstorming.'
            : 'This wizard prepares a prompt for /nak-agent-brainstorming.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <label style={label}>
            <span>{isFr ? 'Vision produit' : 'Product vision'}</span>
            <textarea
              value={draft.vision}
              onChange={(event) => setDraft((prev) => ({ ...prev, vision: event.target.value }))}
              rows={3}
              style={input}
            />
          </label>
          <label style={label}>
            <span>{isFr ? 'Utilisateurs cibles' : 'Target users'}</span>
            <textarea
              value={draft.users}
              onChange={(event) => setDraft((prev) => ({ ...prev, users: event.target.value }))}
              rows={2}
              style={input}
            />
          </label>
          <label style={label}>
            <span>{isFr ? 'Problème principal' : 'Main problem'}</span>
            <textarea
              value={draft.problem}
              onChange={(event) => setDraft((prev) => ({ ...prev, problem: event.target.value }))}
              rows={3}
              style={input}
            />
          </label>
          <label style={label}>
            <span>{isFr ? 'Contraintes' : 'Constraints'}</span>
            <textarea
              value={draft.constraints}
              onChange={(event) => setDraft((prev) => ({ ...prev, constraints: event.target.value }))}
              rows={2}
              style={input}
            />
          </label>
        </div>
        {error && (
          <p style={{ margin: '10px 0 0', color: 'var(--danger)', fontSize: 12 }}>{error}</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
          <button onClick={() => void handleCopyPrompt()} style={secondary}>
            {isFr ? 'Copier le prompt' : 'Copy prompt'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={secondary}>
              {isFr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit || status === 'submitting'}
              style={primary(!canSubmit || status === 'submitting')}
            >
              {status === 'submitting'
                ? (isFr ? 'Ouverture…' : 'Launching…')
                : (isFr ? 'Lancer brainstorming' : 'Launch brainstorming')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.35)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 1400,
};

const modal: React.CSSProperties = {
  width: 'min(760px, calc(100vw - 40px))',
  maxHeight: 'calc(100vh - 40px)',
  overflowY: 'auto',
  border: '1px solid var(--line)',
  borderRadius: 10,
  background: 'var(--bg-card)',
  padding: 16,
  boxShadow: 'var(--shadow-lg)',
};

const closeBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 14,
};

const label: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 12,
  color: 'var(--text-muted)',
};

const input: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: '8px 10px',
  background: 'var(--bg-soft)',
  color: 'var(--text)',
  resize: 'vertical',
  boxSizing: 'border-box',
};

const secondary: React.CSSProperties = {
  border: '1px solid var(--line)',
  background: 'var(--bg-soft)',
  color: 'var(--text)',
  borderRadius: 10,
  padding: '8px 10px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

function primary(disabled: boolean): React.CSSProperties {
  return {
    border: 'none',
    background: disabled ? 'var(--line-strong)' : 'var(--primary)',
    color: '#fff',
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
