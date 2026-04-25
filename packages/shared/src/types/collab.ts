/** A single message posted in a {@link CollabSession} multi-agent thread. */
export interface CollabMessage {
  id: string;
  agentRole: string;
  model?: string;
  content: string;
  respondingTo?: string;
  postedAt: string;
}

/**
 * Multi-agent collaboration thread scoped to one workspace. Agents post
 * {@link CollabMessage} entries and a final synthesis is written when the
 * session is resolved.
 */
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
