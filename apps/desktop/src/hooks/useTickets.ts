import { useCallback, useEffect, useState } from 'react';
import type { LocalEpic, LocalTicket } from '@nakiros/shared';

export function useTickets(workspaceId: string) {
  const [tickets, setTickets] = useState<LocalTicket[]>([]);
  const [epics, setEpics] = useState<LocalEpic[]>([]);

  const refresh = useCallback(async () => {
    const [nextTickets, nextEpics] = await Promise.all([
      window.nakiros.getTickets(workspaceId),
      window.nakiros.getEpics(workspaceId),
    ]);
    setTickets(nextTickets);
    setEpics(nextEpics);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upsertTicketLocal = useCallback((ticket: LocalTicket) => {
    setTickets((prev) => {
      const found = prev.some((item) => item.id === ticket.id);
      if (!found) return [...prev, ticket];
      return prev.map((item) => (item.id === ticket.id ? ticket : item));
    });
  }, []);

  const addTicketLocal = useCallback((ticket: LocalTicket) => {
    setTickets((prev) => [...prev, ticket]);
  }, []);

  const saveTicket = useCallback(async (ticket: LocalTicket) => {
    await window.nakiros.saveTicket(workspaceId, ticket);
    upsertTicketLocal(ticket);
  }, [workspaceId, upsertTicketLocal]);

  const removeTicket = useCallback(async (ticketId: string) => {
    await window.nakiros.removeTicket(workspaceId, ticketId);
    setTickets((prev) => prev.filter((ticket) => ticket.id !== ticketId));
  }, [workspaceId]);

  return {
    tickets,
    epics,
    refresh,
    upsertTicketLocal,
    addTicketLocal,
    saveTicket,
    removeTicket,
  };
}
