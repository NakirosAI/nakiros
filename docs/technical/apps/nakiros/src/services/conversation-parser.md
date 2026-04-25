# conversation-parser.ts

**Path:** `apps/nakiros/src/services/conversation-parser.ts`

Parse Claude Code conversation JSONL files from a provider project directory (`~/.claude/projects/<encoded-cwd>/*.jsonl`). Cheap metadata scan for list views + full message replay when a conversation is opened.

## Exports

### `function listConversations`

List all conversations (JSONL sessions) for a project. Returns metadata (first/last timestamps, message count, tools used, git branch, cwd, summary from first user message) without loading full message contents. Sorted by most-recent-first.

```ts
export function listConversations(providerProjectDir: string, projectId: string): ProjectConversation[]
```

### `function getConversationMessages`

Read all messages from a single conversation JSONL file. Filters out meta / command wrapper messages, keeps user + assistant + system turns, collapses text blocks into `content` and stashes tool_use blocks under `toolUse[]`.

```ts
export function getConversationMessages(providerProjectDir: string, sessionId: string): ConversationMessage[]
```
