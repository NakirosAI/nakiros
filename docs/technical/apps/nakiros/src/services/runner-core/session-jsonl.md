# session-jsonl.ts

**Path:** `apps/nakiros/src/services/runner-core/session-jsonl.ts`

Parses a Claude Code session JSONL file (`~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`) into typed `SessionBlock` values. Single source of truth for run timelines across all run kinds (fix / audit / eval / create). Every block carries an ISO `ts` extracted from the JSONL line's own `timestamp` field, so runners never synthesize timestamps with `Date.now()`.

## Exports

### `SessionBlock`

```ts
export type SessionBlock =
  | { kind: 'user_text'; ts: string; text: string }
  | { kind: 'assistant_text'; ts: string; text: string }
  | { kind: 'assistant_tool'; ts: string; name: string; input: Record<string, unknown> }
```

Discriminated union representing one parsed line from the session JSONL. `user_text` carries free-form user messages (command wrappers are pre-filtered). `assistant_tool` carries the raw `input` so callers can build diff cards or structured findings.

---

### `getSessionJsonlPath`

```ts
export function getSessionJsonlPath(workdir: string, sessionId: string): string
```

Resolves the canonical path `~/.claude/projects/<encodeProjectPath(workdir)>/<sessionId>.jsonl`. Uses the same encoding the Claude Code CLI itself uses to namespace projects on disk.

**Parameters:**
- `workdir` — absolute cwd of the claude subprocess (the run's workdir)
- `sessionId` — session id captured from the stream's `system` event

**Returns:** absolute path to the session JSONL file (may not exist yet)

---

### `parseSessionBlocks`

```ts
export function parseSessionBlocks(workdir: string, sessionId: string): SessionBlock[]
```

Parse a Claude Code session JSONL into structured `SessionBlock`s, applying the canonical filter set:
- `isMeta` and `isSidechain` lines skipped
- User `<command-name>` / `<command-message>` / `<local-command-*>` wrappers skipped
- User `tool_result` blocks skipped (the matching `assistant_tool` already represents the action)
- Empty assistant lines and un-parseable JSON lines skipped

Returns blocks in file order. Returns an empty array when the file doesn't exist or cannot be read.

**Parameters:**
- `workdir` — absolute cwd of the claude subprocess
- `sessionId` — session id captured during the run

**Returns:** ordered array of `SessionBlock`; empty if file absent or unreadable

---

### `isCommandWrapperText`

```ts
export function isCommandWrapperText(text: string): boolean
```

Returns `true` when `text` is one of the slash-command wrapper blocks Claude Code injects around skill bootstraps (`<command-name>`, `<command-message>`, `<local-command-*>`). Used by `parseSessionBlocks` to skip synthetic framing lines.

**Parameters:**
- `text` — raw string content of a user message line

**Returns:** `true` if the text is a CLI wrapper that should be suppressed

---

### `pickUserFreeText`

```ts
export function pickUserFreeText(blocks: unknown[]): string | null
```

From a user content array that may mix `tool_result` and text blocks, returns the first free-form text block. Returns `null` when the array contains only `tool_result` or attachment blocks.

**Parameters:**
- `blocks` — raw `message.content` array from a user JSONL line

**Returns:** first free-form text string, or `null` if none present
