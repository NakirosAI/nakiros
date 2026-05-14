# claude-agents-writer.ts

**Path:** `apps/nakiros/src/services/claude-agents-writer.ts`

Write side of the `.claude/agents/` editor (Module 2 V2). Reads / creates / saves / deletes
subagent markdown files with optimistic-lock guard via mtime. Raw frontmatter is stored as a
string; the frontend uses YAML's Document API for structured + raw views. On save, YAML is
validated before any write so a broken frontmatter is never persisted.

## Exports

### `readAgentForEditor`

```ts
export function readAgentForEditor(projectPath: string, name: string): AgentFileContent | null
```

Read a subagent file and decompose it into `frontmatterRaw`, `body`, and `parsed` essentials.
Returns `null` when the name doesn't match the safe-name pattern or the file is missing.

### `createAgent`

```ts
export function createAgent(projectPath: string, request: CreateAgentRequest): AgentMutationResult
```

Scaffold a new `.claude/agents/<name>.md` with a minimal frontmatter template. Returns
`already-exists` when a file with that name exists.

### `saveAgent`

```ts
export function saveAgent(projectPath: string, request: SaveAgentRequest): AgentMutationResult
```

Overwrite frontmatter + body with optimistic-lock (mtime). Rejects with `conflict` when the
file was modified externally. Rejects with `invalid-yaml` when the supplied frontmatter is
not parseable YAML.

### `deleteAgent`

```ts
export function deleteAgent(projectPath: string, name: string): AgentMutationResult
```

Delete a subagent file. Returns `not-found` when the file doesn't exist.
