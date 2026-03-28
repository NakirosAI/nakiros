import type { StoredWorkspace } from './electron.js';

export type JiraBoardType = 'scrum' | 'kanban' | 'unknown';
export type JiraSyncFilter = 'sprint_active' | 'last_3_months' | 'all';

export interface JiraStatus {
  connected: boolean;
  cloudId?: string;
  cloudUrl?: string;
  displayName?: string;
}

export interface JiraSyncResult {
  imported: number;
  updated: number;
  epicsImported: number;
  error?: string;
}

export interface JiraAuthCompletePayload {
  wsId: string;
  cloudUrl: string;
  displayName: string;
  workspace?: StoredWorkspace;
}

export interface JiraAuthErrorPayload {
  wsId: string;
  error: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export interface JiraBoardSelection {
  boardType: JiraBoardType;
  boardId: string | null;
}

export interface JiraTicketCount {
  count: number;
  hasMore: boolean;
}
