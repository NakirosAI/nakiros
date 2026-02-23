import { useState, useEffect } from 'react';
import type { LocalTicket, LocalEpic, TicketStatus, TicketPriority } from '@tiqora/shared';

const STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: 'Backlog',
  todo: 'À faire',
  in_progress: 'En cours',
  done: 'Terminé',
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

interface Props {
  ticket: LocalTicket;
  allTickets: LocalTicket[];
  epics: LocalEpic[];
  repos: string[];
  workspaceId: string;
  onUpdate(ticket: LocalTicket): void;
  onClose(): void;
  onContextCopy(): void;
  copying: boolean;
}

export default function TicketDetail({
  ticket,
  allTickets,
  epics,
  repos,
  workspaceId,
  onUpdate,
  onClose,
  onContextCopy,
  copying,
}: Props) {
  const [t, setT] = useState(ticket);

  useEffect(() => setT(ticket), [ticket]);
  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [onClose]);

  async function save(updated: LocalTicket) {
    const next = { ...updated, updatedAt: new Date().toISOString() };
    setT(next);
    await window.tiqora.saveTicket(workspaceId, next);
    onUpdate(next);
  }

  function field<K extends keyof LocalTicket>(key: K, value: LocalTicket[K]) {
    void save({ ...t, [key]: value });
  }

  // Tickets that block this one
  const blockers = t.blockedBy
    .map((id) => allTickets.find((x) => x.id === id))
    .filter(Boolean) as LocalTicket[];

  // Tickets this one unblocks
  const unblocks = allTickets.filter((x) => x.blockedBy.includes(t.id));

  // Candidates for blockedBy (not self, not already in list)
  const candidates = allTickets.filter((x) => x.id !== t.id && !t.blockedBy.includes(x.id));

  return (
    <div
      style={{
        width: 400,
        borderLeft: '1px solid var(--line)',
        background: 'var(--bg-soft)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{t.id}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onContextCopy}
            disabled={copying}
            style={{
              padding: '5px 10px',
              background: copying ? 'var(--bg-muted)' : 'var(--primary-soft)',
              color: copying ? 'var(--text-muted)' : 'var(--primary)',
              border: '1px solid var(--line)',
              borderRadius: 2,
              cursor: copying ? 'default' : 'pointer',
              fontSize: 12,
            }}
          >
            {copying ? 'Copié ✓' : '⚡ Contexte agent'}
          </button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Body scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Title */}
        <textarea
          value={t.title}
          onChange={(e) => setT((x) => ({ ...x, title: e.target.value }))}
          onBlur={() => field('title', t.title)}
          style={{
            fontSize: 16,
            fontWeight: 600,
            border: '1px solid var(--line)',
            borderRadius: 2,
            padding: '4px 6px',
            resize: 'none',
            width: '100%',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            lineHeight: 1.4,
            minHeight: 56,
          }}
        />

        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Créé le {new Date(t.createdAt).toLocaleDateString('fr-FR')} · MAJ le {new Date(t.updatedAt).toLocaleDateString('fr-FR')}
        </div>

        {/* Selects row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={t.status}
            onChange={(e) => field('status', e.target.value as TicketStatus)}
            style={selectStyle}
          >
            {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select
            value={t.priority}
            onChange={(e) => field('priority', e.target.value as TicketPriority)}
            style={selectStyle}
          >
            {(Object.keys(PRIORITY_LABELS) as TicketPriority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
          {epics.length > 0 && (
            <select
              value={t.epicId ?? ''}
              onChange={(e) => field('epicId', e.target.value || undefined)}
              style={selectStyle}
            >
              <option value="">— epic —</option>
              {epics.map((ep) => (
                <option key={ep.id} value={ep.id}>{ep.name}</option>
              ))}
            </select>
          )}
          {repos.length > 0 && (
            <select
              value={t.repoName ?? ''}
              onChange={(e) => field('repoName', e.target.value || undefined)}
              style={selectStyle}
            >
              <option value="">— repo —</option>
              {repos.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}
        </div>

        {/* Description */}
        <div>
          <label style={labelStyle}>Description</label>
          <textarea
            value={t.description ?? ''}
            onChange={(e) => setT((x) => ({ ...x, description: e.target.value }))}
            onBlur={() => field('description', t.description)}
            placeholder="Décris le ticket…"
            style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        {/* Acceptance criteria */}
        <div>
          <label style={labelStyle}>Critères d'acceptance</label>
          {t.acceptanceCriteria.map((ac, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input
                value={ac}
                onChange={(e) => {
                  const next = [...t.acceptanceCriteria];
                  next[i] = e.target.value;
                  setT((x) => ({ ...x, acceptanceCriteria: next }));
                }}
                onBlur={() => field('acceptanceCriteria', t.acceptanceCriteria)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => {
                  const next = t.acceptanceCriteria.filter((_, j) => j !== i);
                  void save({ ...t, acceptanceCriteria: next });
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const next = [...t.acceptanceCriteria, ''];
              setT((x) => ({ ...x, acceptanceCriteria: next }));
            }}
            style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            + Critère
          </button>
        </div>

        {/* Bloqué par */}
        <div>
          <label style={labelStyle}>Bloqué par</label>
          {blockers.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 2,
                  background: b.status === 'done' ? '#d1fae5' : '#fef3c7',
                  color: b.status === 'done' ? '#065f46' : '#92400e',
                }}
              >
                {b.status === 'done' ? '✅' : '⏳'} {b.id}
              </span>
              <span style={{ fontSize: 13, flex: 1 }}>{b.title}</span>
              <button
                onClick={() => field('blockedBy', t.blockedBy.filter((id) => id !== b.id))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12 }}
              >
                ✕
              </button>
            </div>
          ))}
          {candidates.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) field('blockedBy', [...t.blockedBy, e.target.value]);
              }}
              style={{ ...selectStyle, marginTop: 4 }}
            >
              <option value="">+ Ajouter un bloquant…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.id} — {c.title}</option>
              ))}
            </select>
          )}
        </div>

        {/* Ce ticket débloque */}
        {unblocks.length > 0 && (
          <div>
            <label style={labelStyle}>Débloque</label>
            {unblocks.map((u) => (
              <div key={u.id} style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
                ⏳ <strong>{u.id}</strong> — {u.title}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--line)',
  borderRadius: 2,
  fontSize: 13,
  color: 'var(--text)',
  background: 'var(--bg-soft)',
  width: '100%',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  padding: '5px 8px',
  border: '1px solid var(--line)',
  borderRadius: 2,
  fontSize: 12,
  color: 'var(--text)',
  background: 'var(--bg-soft)',
  cursor: 'pointer',
};
