export interface CollabMessage {
  id: string;
  agentRole: string;
  model?: string;
  content: string;
  respondingTo?: string;
  postedAt: string;
}

export interface CollabSession {
  id: string;
  workspaceId: string;
  topic: string;
  status: 'open' | 'resolved';
  messages: CollabMessage[];
  synthesis?: string;
  createdAt: string;
  resolvedAt?: string;
}
