# collab.ts

**Path:** `packages/shared/src/types/collab.ts`

Multi-agent collaboration thread primitives: a `CollabMessage` is one post, a `CollabSession` groups a workspace-scoped thread of messages with an optional final synthesis.

## Exports

### `interface CollabMessage`

A single message posted in a `CollabSession` multi-agent thread.

```ts
export interface CollabMessage {
  id: string;
  agentRole: string;
  model?: string;
  content: string;
  respondingTo?: string;
  postedAt: string;
}
```

### `interface CollabSession`

Multi-agent collaboration thread scoped to one workspace. Agents post `CollabMessage` entries and a final synthesis is written when the session is resolved.

```ts
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
```
