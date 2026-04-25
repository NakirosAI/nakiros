# conversation.ts

**Path:** `packages/shared/src/types/conversation.ts`

Chat-scope and conversation-state primitives shared by the orchestrator, the stored-conversation repository, and the chat UI. Covers workspace-scoped session state, conversation participants, persisted conversation / tab records, and the agent run request shape.

## Exports

### `type ChatScopeMode`

Whether a chat tab runs on the whole workspace (`global`) or a single repo (`repo`).

```ts
export type ChatScopeMode = 'global' | 'repo';
```

### `type ConversationParticipantStatus`

Runtime status of a conversation participant.

```ts
export type ConversationParticipantStatus = 'idle' | 'running' | 'waiting' | 'error';
```

### `interface ConversationParticipant`

Participant entry in a multi-agent conversation (agent + provider + session id).

```ts
export interface ConversationParticipant {
  participantId: string;
  agentId: string;
  provider: AgentProvider;
  providerSessionId?: string | null;
  sessionId?: string | null;      // legacy alias for providerSessionId
  conversationId: string | null;
  anchorRepoPath: string;
  activeRepoPaths: string[];
  summary: string;
  openQuestions: string[];
  lastUsedAt: string;
  status: ConversationParticipantStatus;
}
```

### `interface WorkspaceScopedSessionState`

Scoped session state for a workspace tab: mode + anchor repo + active repos.

```ts
export interface WorkspaceScopedSessionState {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  mode: ChatScopeMode;
  anchorRepoPath: string;
  activeRepoPaths: string[];
  lastResolvedRepoMentions: string[];
}
```

### `interface StoredConversation`

Persisted conversation record (stored under `~/.nakiros/`) with participants and scope.

### `interface StoredAgentTab`

Persisted tab state for the chat UI — one entry per open conversation tab. Carries the optional `artifactContext` used to constrain writes to a doc/backlog target.

### `interface StoredAgentTabsState`

Persisted tab layout for a single workspace: active tab id + ordered tabs.

```ts
export interface StoredAgentTabsState {
  workspaceId: string;
  activeTabId: string | null;
  tabs: StoredAgentTab[];
}
```

### `interface AgentRunRequest`

Request sent to the daemon to run an agent turn on a workspace/repo scope. Extends `WorkspaceScopedSessionState` with the message content, provider override, and session/conversation ids.
