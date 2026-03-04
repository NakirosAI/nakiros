import { useEffect, useState } from 'react';
import type { LocalTicket, LocalEpic, TicketStatus, TicketPriority } from '@nakiros/shared';

interface Props {
  initialStatus: TicketStatus;
  workspaceId: string;
  ticketPrefix: string;
  ticketCounter: number;
  epics: LocalEpic[];
  repos: string[];
  onCreated(ticket: LocalTicket): void;
  onClose(): void;
}

export default function TicketForm({
  initialStatus,
  workspaceId,
  ticketPrefix,
  ticketCounter,
  epics,
  repos,
  onCreated,
  onClose,
}: Props) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [epicId, setEpicId] = useState('');
  const [repoName, setRepoName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);

    const id = `${ticketPrefix}-${String(ticketCounter + 1).padStart(3, '0')}`;
    const ticket: LocalTicket = {
      id,
      title: title.trim(),
      acceptanceCriteria: [],
      status: initialStatus,
      priority,
      epicId: epicId || undefined,
      repoName: repoName || undefined,
      blockedBy: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await window.nakiros.saveTicket(workspaceId, ticket);
    setSaving(false);
    onCreated(ticket);
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(16, 42, 67, 0.28)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 14,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--bg-soft)',
          borderRadius: 10,
          padding: 24,
          width: 480,
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--line)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 17 }}>
          Nouveau ticket — {ticketPrefix}-{String(ticketCounter + 1).padStart(3, '0')}
        </h2>
        <p style={{ margin: '-4px 0 2px', fontSize: 12, color: 'var(--text-muted)' }}>
          Appuie sur <kbd>Esc</kbd> pour fermer rapidement.
        </p>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titre du ticket"
          style={inputStyle}
          required
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Priorité</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
              style={inputStyle}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>

          {epics.length > 0 && (
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Epic</span>
              <select
                value={epicId}
                onChange={(e) => setEpicId(e.target.value)}
                style={inputStyle}
              >
                <option value="">— aucun —</option>
                {epics.map((ep) => (
                  <option key={ep.id} value={ep.id}>{ep.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {repos.length > 0 && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Repo cible</span>
            <select
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              style={inputStyle}
            >
              <option value="">— non spécifié —</option>
              {repos.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Annuler
          </button>
          <button type="submit" disabled={!title.trim() || saving} style={btnPrimary(!title.trim() || saving)}>
            {saving ? 'Création…' : 'Créer'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--line)',
  borderRadius: 10,
  fontSize: 14,
  color: 'var(--text)',
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--bg-soft)',
};

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 20px',
    background: disabled ? 'var(--line-strong)' : 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 14,
    fontWeight: 700,
  };
}

const btnSecondary: React.CSSProperties = {
  padding: '8px 16px',
  background: 'var(--bg-muted)',
  color: 'var(--text)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};
