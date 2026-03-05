import clsx from 'clsx';
import type { LocalEpic, LocalTicket, TicketStatus } from '@nakiros/shared';

const PRIORITY_LABELS = { low: 'Low', medium: 'Med', high: 'High' };
const PRIORITY_CLASSES = { low: 'text-[#10b981]', medium: 'text-[#f59e0b]', high: 'text-[#ef4444]' };

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
      className={clsx(
        'flex cursor-pointer flex-col gap-1.5 rounded-[10px] border bg-[var(--bg-soft)] p-[10px_12px] shadow-none',
        selected ? 'border-[var(--primary)]' : 'border-[var(--line)]',
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className={clsx('text-[11px] font-bold uppercase', PRIORITY_CLASSES[ticket.priority])}
        >
          ● {PRIORITY_LABELS[ticket.priority]}
        </span>
        <span className="font-mono text-[11px] text-[var(--text-muted)]">
          {ticket.id}
        </span>
      </div>

      <p className="m-0 text-[13px] font-medium leading-[1.4]">
        {ticket.title}
      </p>

      <div
        className="flex flex-wrap items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        {epic && (
          <span
            className="rounded-[10px] border border-[var(--line-strong)] bg-[var(--primary-soft)] px-1.5 py-0.5 text-[11px] text-[var(--primary)]"
          >
            {epic.name}
          </span>
        )}
        {hasBlockers && (
          <span
            className={clsx(
              'text-[11px]',
              someBlockersPending ? 'text-[#f59e0b]' : 'text-[#10b981]',
            )}
            title={`${blockersDoneCount}/${ticket.blockedBy.length} bloquants terminés`}
          >
            {someBlockersPending ? '⚠️' : '✅'} {ticket.blockedBy.length}
          </span>
        )}

        <div className="ml-auto flex gap-1">
          {currentIdx > 0 && (
            <button
              title="Reculer"
              onClick={() => onStatusChange(STATUS_ORDER[currentIdx - 1]!)}
              className="rounded-[10px] border border-[var(--line)] bg-transparent px-1.5 py-0.5 text-xs text-[var(--text-muted)]"
            >
              ←
            </button>
          )}
          {currentIdx < STATUS_ORDER.length - 1 && (
            <button
              title="Avancer"
              onClick={() => onStatusChange(STATUS_ORDER[currentIdx + 1]!)}
              className="rounded-[10px] border border-[var(--line)] bg-transparent px-1.5 py-0.5 text-xs text-[var(--text-muted)]"
            >
              →
            </button>
          )}
          <button
            title="Générer contexte agent"
            onClick={onContextCopy}
            disabled={copying}
            className={clsx(
              'rounded-[10px] border border-[var(--line)] bg-transparent px-1.5 py-0.5 text-xs',
              copying ? 'text-[var(--text-muted)]' : 'text-[var(--primary)]',
            )}
          >
            {copying ? '…' : '⚡'}
          </button>
        </div>
      </div>
    </div>
  );
}
