import type { LocalTicket, LocalEpic, TicketStatus } from '@nakiros/shared';

const PRIORITY_COLORS = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' };
const PRIORITY_LABELS = { low: 'Low', medium: 'Med', high: 'High' };

const STATUS_ORDER: TicketStatus[] = ['backlog', 'todo', 'in_progress', 'done'];

interface Props {
  ticket: LocalTicket;
  epics: LocalEpic[];
  allTickets: LocalTicket[];
  selected?: boolean;
  onSelect(): void;
  onStatusChange(newStatus: TicketStatus): void;
  onContextCopy(): void;
  copying: boolean;
}

export default function TicketCard({
  ticket,
  epics,
  allTickets,
  selected,
  onSelect,
  onStatusChange,
  onContextCopy,
  copying,
}: Props) {
  const epic = ticket.epicId ? epics.find((e) => e.id === ticket.epicId) : null;
  const blockersDoneCount = ticket.blockedBy.filter(
    (id) => allTickets.find((t) => t.id === id)?.status === 'done',
  ).length;
  const hasBlockers = ticket.blockedBy.length > 0;
  const allBlockersDone = hasBlockers && blockersDoneCount === ticket.blockedBy.length;
  const someBlockersPending = hasBlockers && !allBlockersDone;

  const currentIdx = STATUS_ORDER.indexOf(ticket.status);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Ouvrir ${ticket.id}`}
      style={{
        background: 'var(--bg-soft)',
        border: selected ? '1px solid var(--primary)' : '1px solid var(--line)',
        borderRadius: 10,
        padding: '10px 12px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        boxShadow: 'none',
      }}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Header: priority + id */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: PRIORITY_COLORS[ticket.priority],
            textTransform: 'uppercase',
          }}
        >
          ● {PRIORITY_LABELS[ticket.priority]}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {ticket.id}
        </span>
      </div>

      {/* Title */}
      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>
        {ticket.title}
      </p>

      {/* Footer: epic + blockers + ctx */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
        onClick={(e) => e.stopPropagation()}
      >
        {epic && (
          <span
            style={{
              fontSize: 11,
              padding: '1px 6px',
              background: epic.color + '22',
              color: epic.color,
              borderRadius: 10,
              border: `1px solid ${epic.color}44`,
            }}
          >
            {epic.name}
          </span>
        )}
        {hasBlockers && (
          <span
            style={{
              fontSize: 11,
              color: someBlockersPending ? '#f59e0b' : '#10b981',
            }}
            title={`${blockersDoneCount}/${ticket.blockedBy.length} bloquants terminés`}
          >
            {someBlockersPending ? '⚠️' : '✅'} {ticket.blockedBy.length}
          </span>
        )}

        {/* Status arrows */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {currentIdx > 0 && (
            <button
              title="Reculer"
              onClick={() => onStatusChange(STATUS_ORDER[currentIdx - 1]!)}
              style={arrowBtn}
            >
              ←
            </button>
          )}
          {currentIdx < STATUS_ORDER.length - 1 && (
            <button
              title="Avancer"
              onClick={() => onStatusChange(STATUS_ORDER[currentIdx + 1]!)}
              style={arrowBtn}
            >
              →
            </button>
          )}
          <button
            title="Générer contexte agent"
            onClick={onContextCopy}
            disabled={copying}
            style={{ ...arrowBtn, color: copying ? 'var(--text-muted)' : 'var(--primary)' }}
          >
            {copying ? '…' : '⚡'}
          </button>
        </div>
      </div>
    </div>
  );
}

const arrowBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: '2px 6px',
  cursor: 'pointer',
  fontSize: 12,
  color: 'var(--text-muted)',
};
