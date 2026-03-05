import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocalTicket, LocalEpic, TicketPriority, TicketStatus, StoredWorkspace } from '@nakiros/shared';
import TicketCard from './TicketCard';
import TicketForm from './TicketForm';
import { Button, EmptyState, Input, Select } from './ui';
import { useDebounce } from '../hooks/useDebounce';

const COLUMNS: { status: TicketStatus; key: string }[] = [
  { status: 'backlog', key: 'columnBacklog' },
  { status: 'todo', key: 'columnTodo' },
  { status: 'in_progress', key: 'columnInProgress' },
  { status: 'done', key: 'columnDone' },
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
}: Props) {
  const { t } = useTranslation('board');
  const [addingIn, setAddingIn] = useState<TicketStatus | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [repoFilter, setRepoFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TicketPriority>('all');
  const [columnBodyHeight, setColumnBodyHeight] = useState<number | null>(null);
  const columnsAreaRef = useRef<HTMLDivElement | null>(null);
  const columnHeaderRefs = useRef<Partial<Record<TicketStatus, HTMLDivElement | null>>>({});
  const columnBodyRefs = useRef<Partial<Record<TicketStatus, HTMLDivElement | null>>>({});

  const repoNames = workspace.repos.map((r) => r.name);
  const prefix = workspace.ticketPrefix ?? 'PROJ';
  const counter = workspace.ticketCounter ?? 0;
  const debouncedQuery = useDebounce(query, 220);
  const normalizedQuery = debouncedQuery.trim().toLowerCase();
  const visibleTickets = tickets.filter((ticket) => {
    const queryMatch = normalizedQuery.length === 0
      || ticket.id.toLowerCase().includes(normalizedQuery)
      || ticket.title.toLowerCase().includes(normalizedQuery);
    const statusMatch = statusFilter === 'all' || ticket.status === statusFilter;
    const repoMatch = repoFilter === 'all' || ticket.repoName === repoFilter;
    const priorityMatch = priorityFilter === 'all' || ticket.priority === priorityFilter;
    return queryMatch && statusMatch && repoMatch && priorityMatch;
  });

  useLayoutEffect(() => {
    if (tickets.length === 0 && !addingIn) {
      setColumnBodyHeight(null);
      return;
    }

    function updateColumnHeights() {
      const area = columnsAreaRef.current;
      if (!area) return;

      let tallestHeader = 0;
      let tallestBodyContent = 120;

      for (const { status } of COLUMNS) {
        const headerEl = columnHeaderRefs.current[status];
        const bodyEl = columnBodyRefs.current[status];
        if (headerEl) tallestHeader = Math.max(tallestHeader, headerEl.offsetHeight);
        if (bodyEl) tallestBodyContent = Math.max(tallestBodyContent, bodyEl.scrollHeight);
      }

      const minBodyHeight = Math.max(120, area.clientHeight - tallestHeader - 8);
      const next = Math.max(minBodyHeight, tallestBodyContent);
      setColumnBodyHeight((prev) => (prev === next ? prev : next));
    }

    const rafId = requestAnimationFrame(updateColumnHeights);
    window.addEventListener('resize', updateColumnHeights);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateColumnHeights);
    };
  }, [addingIn, tickets.length, visibleTickets.length, normalizedQuery, statusFilter, repoFilter, priorityFilter]);

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
    const updatedWs = { ...workspace, ticketCounter: (workspace.ticketCounter ?? 0) + 1 };
    await window.nakiros.saveWorkspace(updatedWs);
    onTicketCreate(ticket);
    setAddingIn(null);
  }

  const statusOptions = [
    { value: 'all', label: t('allStatuses') },
    { value: 'backlog', label: t('statusBacklog') },
    { value: 'todo', label: t('statusTodo') },
    { value: 'in_progress', label: t('statusInProgress') },
    { value: 'done', label: t('statusDone') },
  ];

  const repoOptions = [
    { value: 'all', label: t('allRepos') },
    ...repoNames.map((repoName) => ({ value: repoName, label: repoName })),
  ];

  const priorityOptions = [
    { value: 'all', label: t('allPriorities') },
    { value: 'low', label: t('priorityLow') },
    { value: 'medium', label: t('priorityMedium') },
    { value: 'high', label: t('priorityHigh') },
  ];

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          containerClassName="w-full max-w-[340px]"
          className="rounded-[10px] px-3 py-2 text-[13px]"
        />
        <Select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | TicketStatus)}
          options={statusOptions}
          containerClassName="min-w-[150px]"
          className="rounded-[10px] px-3 py-2 text-[13px]"
        />
        <Select
          value={repoFilter}
          onChange={(event) => setRepoFilter(event.target.value)}
          options={repoOptions}
          containerClassName="min-w-[160px]"
          className="rounded-[10px] px-3 py-2 text-[13px]"
        />
        <Select
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value as 'all' | TicketPriority)}
          options={priorityOptions}
          containerClassName="min-w-[150px]"
          className="rounded-[10px] px-3 py-2 text-[13px]"
        />
        <Button
          onClick={() => setAddingIn('backlog')}
          className="rounded-[10px] text-[13px]"
        >
          + {t('newTicket')}
        </Button>
      </div>

      {tickets.length === 0 && !addingIn ? (
        <EmptyState
          className="flex-1"
          title={t('noTicketsTitle')}
          subtitle={t('noTicketsHint')}
          action={{
            label: t('createFirstTicket'),
            onClick: () => setAddingIn('backlog'),
            variant: 'secondary',
          }}
        />
      ) : (
        <div ref={columnsAreaRef} className="flex flex-1 items-start gap-3 overflow-auto">
          {COLUMNS.map(({ status, key }) => {
            const col = visibleTickets.filter((ticket) => ticket.status === status);
            return (
              <div key={status} className="flex min-w-[260px] flex-1 flex-col gap-2">
                <div
                  ref={(el) => {
                    columnHeaderRefs.current[status] = el;
                  }}
                  className="flex items-center justify-between px-0.5 py-1"
                >
                  <span className="text-[13px] font-bold text-[var(--text)]">
                    {t(key)}
                    <span className="ml-1.5 text-xs text-[var(--text-muted)]">
                      {col.length}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAddingIn(status)}
                    className="h-7 w-7 px-0 text-lg leading-none"
                    title={t('newTicket')}
                  >
                    +
                  </Button>
                </div>

                <div
                  ref={(el) => {
                    columnBodyRefs.current[status] = el;
                  }}
                  className="flex min-h-[120px] flex-col gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--bg-muted)] p-2"
                  style={columnBodyHeight ? { height: columnBodyHeight } : undefined}
                >
                  {col.length === 0 ? (
                    <div className="p-2.5 text-xs text-[var(--text-muted)]">
                      {normalizedQuery ? t('emptyColumnSearch') : t('emptyColumn')}
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
