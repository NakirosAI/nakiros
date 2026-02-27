export type TicketStatus = 'backlog' | 'todo' | 'in_progress' | 'done';
export type TicketPriority = 'low' | 'medium' | 'high';

export interface LocalTicket {
  id: string;
  title: string;
  description?: string;
  acceptanceCriteria: string[];
  status: TicketStatus;
  priority: TicketPriority;
  epicId?: string;
  sprintId?: string;
  blockedBy: string[];
  repoName?: string;
  lastRunAt?: string;
  lastRunStatus?: 'idle' | 'running' | 'success' | 'failed';
  lastRunProvider?: 'claude' | 'codex' | 'cursor';
  lastRunCommand?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalEpic {
  id: string;
  name: string;
  description?: string;
  color: string;
}

export interface LocalSprint {
  id: string;
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  status: 'planning' | 'active' | 'completed';
}
