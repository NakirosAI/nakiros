# session-loader

**Path:** `apps/nakiros/src/services/drift/session-loader.ts`

Locates a Claude Code session JSONL by session ID and extracts structured data for drift detectors: assistant turns with tool-use events (loop detector), real user messages (topic detector), and context window metrics (context detector). Scans all project directories under `~/.claude/projects/` since the session's cwd is not known at call time. All loaders share an internal `readSessionRaw` helper that finds and reads the JSONL file exactly once.

## Exports

### `ContextMetrics`

Context window metrics extracted from a session JSONL in a single lightweight pass (no analysis cache required).

```ts
export interface ContextMetrics {
  maxContextTokens: number
  contextWindow: number
}
```

- `maxContextTokens` — peak value of `input + cache_read + cache_creation` across all assistant turns; mirrors `conversation-analyzer.ts` computation
- `contextWindow` — inferred context window for the model: `1_000_000` when the peak exceeds 250 k, `200_000` otherwise

### `UserMessage`

A single real user message extracted from a JSONL session, containing only text blocks (tool_result blocks are excluded).

```ts
export interface UserMessage {
  index: number
  timestamp: string
  text: string
}
```

- `index` — 0-based index among all real user messages after filtering out `isMeta` and tool_result-only entries
- `timestamp` — ISO timestamp of the user message entry
- `text` — plain text of the user message; multiple text blocks in the same entry are joined with `\n`

### `ToolUseEvent`

A single tool-use record extracted from one assistant turn, paired with the outcome of the corresponding `tool_result`.

```ts
export interface ToolUseEvent {
  tool: string
  input: Record<string, unknown>
  hasError: boolean
  resultContent: string
}
```

- `tool` — tool name as reported by Claude Code (e.g. `"Edit"`, `"Bash"`, `"Read"`)
- `input` — raw tool input object; callers access well-known keys (`file_path`, `command`, `pattern`) defensively
- `hasError` — `true` when the corresponding `tool_result` carried `is_error: true`
- `resultContent` — content string of the `tool_result` (may be empty)

### `AssistantTurn`

A single assistant reply in a session, containing zero or more tool invocations.

```ts
export interface AssistantTurn {
  index: number
  timestamp: string
  toolUses: ToolUseEvent[]
}
```

- `index` — 1-indexed position of this assistant reply in the full session
- `timestamp` — ISO timestamp of the assistant reply
- `toolUses` — all tool-use events inside this message, in source order

### `loadSessionTurns`

```ts
export function loadSessionTurns(sessionId: string): AssistantTurn[] | null
```

Locate and parse a Claude Code session JSONL by session ID, returning assistant turns with tool-use events.

Performs a two-pass parse: pass 1 indexes all `tool_result` entries by `tool_use_id` from `user` messages; pass 2 iterates `assistant` messages and attaches the matching `tool_result` outcome to each `tool_use` block. Returns `null` if the file is not found, cannot be read, or is empty.

**Parameters:**
- `sessionId` — UUID of the Claude Code session to load

**Returns:** ordered `AssistantTurn[]` for the session, or `null` if not found

### `loadUserMessages`

```ts
export function loadUserMessages(sessionId: string): UserMessage[] | null
```

Locate and parse the real user messages from a Claude Code session JSONL.

Only entries that carry at least one `text` block are included — pure `tool_result` entries (tool output injected as user turns by Claude Code) are skipped, as are `isMeta` housekeeping entries. The text from multiple `text` blocks in the same entry is joined with `\n`. Returns `null` if the file is not found, cannot be read, or is empty.

**Parameters:**
- `sessionId` — UUID of the Claude Code session to load

**Returns:** ordered `UserMessage[]` (real user intent only), or `null` if not found

### `loadContextMetrics`

```ts
export function loadContextMetrics(sessionId: string): ContextMetrics | null
```

Locate and extract context window metrics from a Claude Code session JSONL.

Performs a lightweight single-pass scan over assistant entries only — no analysis cache is required. Computes the peak `input + cache_read + cache_creation` token count and infers the model's context window size. Returns `null` if the session file cannot be found or read.

**Parameters:**
- `sessionId` — UUID of the Claude Code session to load

**Returns:** `ContextMetrics` with `maxContextTokens` and `contextWindow`, or `null` if not found
