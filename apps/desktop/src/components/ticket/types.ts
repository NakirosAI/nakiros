import type { LocalTicket } from '@nakiros/shared';

export type TicketFieldUpdater = <K extends keyof LocalTicket>(
  key: K,
  value: LocalTicket[K],
) => void;

