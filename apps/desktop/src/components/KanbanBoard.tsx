import { useState } from 'react';
import type { LocalTicket, LocalEpic, TicketPriority, TicketStatus, StoredWorkspace } from '@nakiros/shared';
import type { ResolvedLanguage } from '@nakiros/shared';
import TicketCard from './TicketCard';
import TicketForm from './TicketForm';
import { MESSAGES } from '../i18n';

const COLUMNS: { status: TicketStatus; label: string }[] = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'todo', label: 'À faire' },
  { status: 'in_progress', label: 'En cours' },
  { status: 'done', label: 'Terminé' },
];

interface Props {
  workspace: StoredWorkspace;
  tickets: LocalTicket[];
  epics: LocalEpic[];
  onTicketUpdate(ticket: LocalTicket): void;
  onTicketCreate(ticket: LocalTicket): void;
  onSelectTicket(ticket: LocalTicket): void;
  selectedTicketId?: string;
  onContextCopied?(ticketId: string): void;
  language: ResolvedLanguage;
}

export default function KanbanBoard({
  workspace,
  tickets,
  epics,
  onTicketUpdate,
  onTicketCreate,
  onSelectTicket,
  selectedTicketId,
  onContextCopied,
  language,
}: Props) {
  const msg = MESSAGES[language];
  const [addingIn, setAddingIn] = useState<TicketStatus | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [repoFilter, setRepoFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TicketPriority>('all');

  const repoNames = workspace.repos.map((r) => r.name);
  const prefix = workspace.ticketPrefix ?? 'PROJ';
  const counter = workspace.ticketCounter ?? 0;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTickets = tickets.filter((ticket) => {
    const queryMatch = normalizedQuery.length === 0
      || ticket.id.toLowerCase().includes(normalizedQuery)
      || ticket.title.toLowerCase().includes(normalizedQuery);
    const statusMatch = statusFilter === 'all' || ticket.status === statusFilter;
    const repoMatch = repoFilter === 'all' || ticket.repoName === repoFilter;
    const priorityMatch = priorityFilter === 'all' || ticket.priority === priorityFilter;
    return queryMatch && statusMatch && repoMatch && priorityMatch;
  });

  async function handleContextCopy(ticket: LocalTicket) {
    setCopyingId(ticket.id);
    try {
      const ctx = await window.nakiros.generateContext(workspace.id, ticket.id, workspace);
      await window.nakiros.writeClipboard(ctx);
      onContextCopied?.(ticket.id);
    } finally {
      setTimeout(() => setCopyingId(null), 1500);
    }
  }

  async function handleStatusChange(ticket: LocalTicket, newStatus: TicketStatus) {
    const updated = { ...ticket, status: newStatus, updatedAt: new Date().toISOString() };
    await window.nakiros.saveTicket(workspace.id, updated);
    onTicketUpdate(updated);
  }

  async function handleTicketCreated(ticket: LocalTicket) {
    // Increment counter in workspace
    const updatedWs = { ...workspace, ticketCounter: (workspace.ticketCounter ?? 0) + 1 };
    await window.nakiros.saveWorkspace(updatedWs);
    onTicketCreate(ticket);
    setAddingIn(null);
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={msg.board.searchPlaceholder}
          style={{
            maxWidth: 340,
            width: '100%',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: '8px 12px',
            background: 'var(--bg-soft)',
            color: 'var(--text)',
            fontSize: 13,
          }}
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | TicketStatus)}
          style={filterStyle}
        >
          <option value="all">Tous statuts</option>
          <option value="backlog">Backlog</option>
          <option value="todo">A faire</option>
          <option value="in_progress">En cours</option>
          <option value="done">Termine</option>
        </select>
        <select
          value={repoFilter}
          onChange={(event) => setRepoFilter(event.target.value)}
          style={filterStyle}
        >
          <option value="all">Tous repos</option>
          {repoNames.map((repoName) => (
            <option key={repoName} value={repoName}>
              {repoName}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value as 'all' | TicketPriority)}
          style={filterStyle}
        >
          <option value="all">Toutes priorites</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button
          onClick={() => setAddingIn('backlog')}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: 10,
            background: 'var(--primary)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + {msg.board.newTicket}
        </button>
      </div>

      {tickets.length === 0 && !addingIn ? (
        <div
          style={{
            flex: 1,
            display: 'grid',
            placeItems: 'center',
            border: '1px dashed var(--line-strong)',
            borderRadius: 10,
            background: 'var(--bg-soft)',
            textAlign: 'center',
            padding: 24,
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{msg.board.noTicketsTitle}</p>
            <p style={{ margin: '6px 0 14px', color: 'var(--text-muted)', fontSize: 13 }}>
              {msg.board.noTicketsHint}
            </p>
            <button
              onClick={() => setAddingIn('backlog')}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid var(--line)',
                background: 'var(--bg-soft)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {msg.board.createFirstTicket}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, flex: 1, overflow: 'auto' }}>
          {COLUMNS.map(({ status, label }) => {
            const col = visibleTickets.filter((t) => t.status === status);
            return (
              <div
                key={status}
                style={{
                  minWidth: 260,
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 2px',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    {label}
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>
                      {col.length}
                    </span>
                  </span>
                  <button
                    onClick={() => setAddingIn(status)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      fontSize: 18,
                      lineHeight: 1,
                      padding: '0 4px',
                    }}
                    title="Nouveau ticket"
                  >
                    +
                  </button>
                </div>

                <div
                  style={{
                    background: 'var(--bg-muted)',
                    border: '1px solid var(--line)',
                    borderRadius: 10,
                    padding: 8,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    minHeight: 120,
                  }}
                >
                  {col.length === 0 ? (
                    <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                      {normalizedQuery ? msg.board.emptyColumnSearch : msg.board.emptyColumn}
                    </div>
                  ) : (
                    col.map((ticket) => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        epics={epics}
                        allTickets={tickets}
                        selected={selectedTicketId === ticket.id}
                        onSelect={() => onSelectTicket(ticket)}
                        onStatusChange={(s) => void handleStatusChange(ticket, s)}
                        onContextCopy={() => void handleContextCopy(ticket)}
                        copying={copyingId === ticket.id}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {addingIn && (
        <TicketForm
          initialStatus={addingIn}
          workspaceId={workspace.id}
          ticketPrefix={prefix}
          ticketCounter={counter}
          epics={epics}
          repos={repoNames}
          onCreated={handleTicketCreated}
          onClose={() => setAddingIn(null)}
        />
      )}
    </div>
  );
}

const filterStyle: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: '8px 10px',
  background: 'var(--bg-soft)',
  color: 'var(--text)',
  fontSize: 13,
};
